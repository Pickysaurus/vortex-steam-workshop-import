import { ComponentEx, selectors, types, util, Modal, Steps, Spinner, Table, ITableRowAction, TableTextFilter, Icon, fs, tooltip } from 'vortex-api';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as React from 'react';
import * as Redux from 'redux';
import { Alert, Button, ProgressBar, Col, Row } from 'react-bootstrap';

import findWorkshopPath, { getWorkshopModData } from '../util/workshopUtil';
import { ISteamWorkshopEntry } from '../types/workshopEntries';
import importMods from '../util/import';


type Step = 'start' | 'setup' | 'working' | 'review' | 'wait' | 'cleanup';

interface IBaseProps {
    visible: boolean;
    onHide: () => void;
  }
  
interface IConnectedProps {
    steamAppId: string;
    gameId: string;
    discovered: { [gameId: string]: types.IDiscoveryResult };
    mods: { [modId: string]: types.IMod };
}
  
interface IActionProps {
}

type IProps = IBaseProps & IConnectedProps & IActionProps;

interface IComponentState {
    importStep: Step;
    error?: JSX.Element;
    importEnabled: { [id: string]: boolean };
    workshopPath: string;
    importArchives: boolean;
    importPathInvalid?: string;
    importModsToDisable?: ISteamWorkshopEntry[];
    importPath?: string;
    progress?: { mod: string, perc: number };
    failedImports: string[];
    modsToImport: { [id: string]: ISteamWorkshopEntry };
    counter: number;
  }


class ImportDialog extends ComponentEx<IProps, IComponentState> {
    private static STEPS: Step[] = [ 'start', 'setup', 'working', 'cleanup', 'review' ];

    private mAttributes: types.ITableAttribute[];
    private mActions: ITableRowAction[];

    constructor(props: IProps) {
        super(props);
    
        this.initState({
            importStep: undefined,
            importArchives: true,
            importEnabled: {},
            workshopPath: undefined,
            failedImports: [],
            counter: 0,
            modsToImport: {},
        });

        this.mActions = this.genActions();
        this.mAttributes = this.genAttributes();
    };

    public UNSAFE_componentWillReceiveProps(newProps: IProps) {
        if (!this.props.visible && newProps.visible) {
            this.start();
        }
    }

    private start(): Promise<void> {
        // tasks to perform before loading the start step.
        const { t } = this.props;
        const { discovered, gameId, steamAppId } = this.props;
        this.nextState.importStep = 'start';
        this.nextState.error = undefined;
        return findWorkshopPath(discovered, gameId, steamAppId)
          .then(found => {
            this.nextState.workshopPath = found;
          })
          .catch(err => {
              if (err === 'NON_STEAM') {
                  // The game doesn't have a Steam App ID.
                  this.nextState.error = (
                  <span>
                      <h3>{t('Steam Workshop folder not found')}</h3>
                      {t('This game is not installed via Steam or the Steam App ID is not definied in the extension.')}
                  </span>)
                }
              else if (err.code === 'ENOENT') {
                  // The workshop folder doesn't exist.
                  this.nextState.error = (
                  <span>
                      <h3>{t('Steam Workshop folder not found')}</h3>
                      {t('The Steam Workshop folder does not exist for this game. This could mean that this game is not installed through Steam or you do not have any mods from the Workshop.')}
                  </span>)
                }
              else if (err === 'NO_MODS') {
                  // No mods inside the workshop folder.
                  this.nextState.error = (
                    <span>
                    <h3>{t('No Workshop mods installed')}</h3>
                    {t('It doesn\'t look like you have any Steam Workshop mods installed at the moment.')}
                    </span>
                  )
              }
              else {
                  // Catch any other errors.
                  this.nextState.error = (
                  <span>
                      <h3>{t('Unknown error')}</h3>
                      {t('An error occured accessing your Steam Workshop folder:')} {err.message}.
                  </span>)
                }
              }
          );
    }

    private setup(): Promise<any> {
        // Tasks to perform before loading the setup step.
        const { workshopPath } = this.state;
        const { mods } = this.props;
        const vortexState = this.context.api.store.getState();
        const networkConnected = vortexState.session.base.networkConnected;

        if (!networkConnected) {
            this.nextState.error = (<span><h2>No network connection</h2>Vortex is currently offline. An internet connection is required to use this feature.</span>);
            return Promise.resolve();
        }

        return getWorkshopModData(workshopPath)
            .then((workshopMods: ISteamWorkshopEntry[]) => this.nextState.modsToImport = convertWorkshopMods(workshopMods, mods))
            .catch(err => {
                if (err.code === 'ENOTFOUND') return this.nextState.error = (<span><h3>Steam API could not be reached</h3>Please ensure you have an internet connection to use the feature.</span>)
            else this.nextState.error = <p>Error with the Steam API {err.code} {err.message}</p>
            });
    }

    private startImport(): Promise<void> {
        const { t } = this.props;
        const { modsToImport, workshopPath } = this.state;

        const modList = modsToImport ? Object.keys(modsToImport).map(id => modsToImport[id]): [];
        const enabledMods = modList.filter(mod => this.isModEnabled(mod));

        // Might want to check we can write to the folder(s) here?

        importMods(t, this.context.api.store, workshopPath, enabledMods, (mod: string, perc: number) => {
            this.nextState.progress = { mod, perc };
        })
        .then(errors => {
            this.nextState.failedImports = errors;
            this.setStep('cleanup');
        });

        return Promise.resolve();

        
    }

    private cleanupCheck(): Promise<void> {
        const { modsToImport, workshopPath, failedImports } = this.state;

        const modList = Object.keys(modsToImport).map(id => modsToImport[id]);
        // Filter to only show mods we selected and those that imported successfully. 
        const enabledMods = modList.filter(mod => this.isModEnabled(mod) && !failedImports.includes(mod.title));

        if (!enabledMods.length) {
            this.setStep('review');
            return Promise.resolve();
        }

        const modIds = enabledMods.map(mod => mod.publishedfileid);

        return fs.readdirAsync(workshopPath)
        .then((folders) => {
            if (!folders.length) return this.setStep('review');
            const pending : ISteamWorkshopEntry[] = folders.map(id => modIds.includes(id) ? modsToImport[id] : null).filter(m => m !== null);
            this.nextState.importModsToDisable = pending;
            return Promise.resolve();
        })
        .catch(err => this.nextState.error = (<span><h3>Unknown error</h3>{err.message}</span>));
    }

    private nop = () => undefined;

    private cancel = () => {
        this.props.onHide();
    }
    
    
    public render(): JSX.Element {
        const { t, visible } = this.props;
        const { error, importStep } = this.state;

        const canCancel = ['start', 'setup'].indexOf(importStep) !== -1;

        return(
            <Modal id='workshop-import-dialog' show={visible} onHide={this.nop}>
                <Modal.Header>
                    <h2>{t('Steam Workshop Import Tool')}</h2>
                    {this.renderSteps(importStep)}
                </Modal.Header>
                <Modal.Body>
                    {error !== undefined ? <Alert>{error}</Alert> : this.renderContent(importStep)}
                </Modal.Body>
                <Modal.Footer>
                    <Button disabled={!canCancel} onClick={this.cancel}>{t('Cancel')}</Button>
                    <Button disabled={this.previousDisabled()} onClick={this.previous}>{t('Previous')}</Button>
                    <Button disabled={this.nextDisabled()} onClick={this.next}>{importStep === 'review' ? t('Finish') : t('Next')}</Button>
                </Modal.Footer>
            </Modal>
        )
    }

    private nextDisabled():boolean {
        // Can we use the next button?
        const {error, workshopPath, importStep, importModsToDisable, importEnabled} = this.state;
        return (error !== undefined) || (importStep === 'wait') 
        || ((importStep === 'start') && (workshopPath === undefined)) 
        || ((importStep === "cleanup") && (!!importModsToDisable.length)) 
        || ((importStep === 'setup') && (Object.keys(importEnabled).map(key => importEnabled[key] === true).length) === 0);
    }

    private previousDisabled():boolean {
        // Can we use the previous button?
        const {error, importStep} = this.state;
        return (error !== undefined) || (importStep === 'wait') || (importStep === 'start') || (importStep === 'cleanup');
    }

    private next = (): void => {
        // On clicking next
        const { importStep } = this.state;
        const currentIdx = ImportDialog.STEPS.indexOf(importStep);
        this.setStep(ImportDialog.STEPS[currentIdx + 1]);
    }

    private previous = ():void => {
        // On clicking previous
        const { importStep } = this.state;
        const currentIdx = ImportDialog.STEPS.indexOf(importStep);
        this.setStep(ImportDialog.STEPS[currentIdx - 1]);
    }

    private setStep(newStep: Step) {
        // Transition to the next step and display a loading screen while setting up.
        this.nextState.importStep = 'wait';
    
        let job: Promise<void> = Promise.resolve();
        if (newStep === 'start') {
          job = this.start();
        } else if (newStep === 'setup') {
          job = this.setup();
        } else if (newStep === 'working') {
          job = this.startImport();
        } else if (newStep === 'cleanup') {
          job = this.cleanupCheck();
        }else if (newStep === undefined) {
            this.props.onHide();
        }
        job.then(() => this.nextState.importStep = newStep);
    }

    private renderSteps(step: Step): JSX.Element {
        // The Step counter at the top of the modal.
        const { t } = this.props;
        const { importStep } = this.state;

        return (
        <Steps step={importStep} style={{ marginBottom: 32 }}>
            <Steps.Step
            key='start'
            stepId='start'
            title={t('Start')}
            description={t('Introduction')}
            />
            <Steps.Step
            key='setup'
            stepId='setup'
            title={t('Setup')}
            description={t('Select Mods to import')}
            />
            <Steps.Step
            key='working'
            stepId='working'
            title={t('Import')}
            description={t('Magic happens')}
            />
            <Steps.Step
            key='cleanup'
            stepId='cleanup'
            title={t('Cleanup')}
            description={t('Unsubscribe from the workshop mods')}
            />
            <Steps.Step
            key='review'
            stepId='review'
            title={t('Review')}
            description={t('Import result')}
            />
        </Steps>
    )};

    private renderContent(step: Step): JSX.Element {
        // Which step to load?
        switch(step) {
            case 'wait' : return this.renderWait();
            case 'start': return this.renderStart();
            case 'setup' : return this.renderSelectMods();
            case 'working' : return this.renderWorking();
            case 'cleanup' : return this.renderCleanup();
            case 'review' : return this.renderReview();
            default: return null;
        }
    }

    private renderWait(): JSX.Element {
        // Holding page if we're waiting for a Promise.
        return (
            <div className='workshop-wait-container'>
                <Spinner className='page-wait-spinner' />
            </div>
        )
    }

    private renderStart(): JSX.Element {
        // Start step. 
        const { t } = this.props;
        const { workshopPath } = this.state;

        return(
            <span className='workshop-start'>
                <img src={`file://${__dirname}/steam-to-vortex.png`} />
                <h3>{t('Bring your Workshop mods to Vortex')}</h3>
                {t('This tool will allow you to import mods installed through Steam Workshop into Vortex.')}
                <div>
                    {t('Before you continue, please be aware of the following:')}
                    <ul>
                        <li>{t('If you have a lot of mods, this process can take some time.')}</li>
                        <li>{t('You must be logged into Steam with the user account subscribed to the Workshop items.')}</li>
                        <li>{t('Once your mods have been imported, they will no longer be updated by Steam.')}</li>
                    </ul>
                </div>
                {!workshopPath ? <Spinner /> 
                : (<div>{t('Your Steam workshop mods have been found in: ')}<a onClick={() => util.opn(workshopPath)}>{workshopPath}</a></div>)
                }
            </span>
        )
    }

    private renderWorking(): JSX.Element {
        const { t } = this.props;
        const { progress } = this.state;
        if (progress === undefined) return null;

        const perc = Math.floor(progress.perc * 100);
        return(
            <div className='workshop-import-container'>
                <span>{t('Currently importing: {{mod}}', {replace: { mod: progress.mod } })}</span>
                <ProgressBar now={perc} label={`${perc}%`} />
            </div>
        )
    }

    private renderSelectMods(): JSX.Element {
        const { t } = this.props;
        const { counter, modsToImport } = this.state;

        // setup step.
        return(
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                <Table 
                    tableId='workshop-mod-imports'
                    data={modsToImport}
                    dataId={counter}
                    actions={this.mActions}
                    staticElements={this.mAttributes}
                />
            </div>
        );
    }

    private renderCleanup(): JSX.Element {
        const { t } = this.props;
        const { importModsToDisable, workshopPath } = this.state;

        return(
            <div className='workshop-import-container'>
                <h3>{t('Unsubscribe in Steam Workshop')}</h3>
                <p>{t('Your Steam Workshop mods have been imported successfully!')}</p>
                <p>{t('Before you continue, you need to unsubscribe from the mods to prevent conflicts with the imported copy.')}</p>
                <p><a href='steam://openurl/https://steamcommunity.com/id/Silly_zombie/myworkshopfiles?browsefilter=mysubscriptions'>{t('See all subscribed mods in Steam')}</a></p>
                <Button className="refresh-btn" onClick={() => this.setStep('cleanup')}>{t('Refresh')}</Button>
                <div className='import-mods-to-disable'>
                {this.renderModsToDisable(importModsToDisable)}
                </div>
                <b>{t('Stuck here?')}</b> 
                <p>{t('If you\'ve unsubcribed from all the mods but you cannot continue, you\'ll need to delete the leftover folders in your Workshop directory. The folder names are:')} {importModsToDisable.map(m => m.publishedfileid).join(', ')} </p>
                <a onClick={() => util.opn(workshopPath)}>Open Steam Workshop folder</a>
            </div>
        );

    }

    private renderModsToDisable(mods: ISteamWorkshopEntry[]) : JSX.Element[] {
        const { t } = this.props;
        const listItems = mods.map((mod: ISteamWorkshopEntry) => {
            // This little trick will open the workshop page in the Steam client.
            const steamAppUrl = `steam://openurl/https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.publishedfileid}`;
            return (
                <Row key={mod.publishedfileid}>
                    <Col sm={'2'}><img src={mod.preview_url} style={{maxWidth: '50px', maxHeight: '50px'}} /></Col>
                    <Col sm={'6'}>{mod.title}</Col>
                    <Col sm={'4'}><Button href={steamAppUrl}>{t('Open in Workshop')}</Button></Col>
                </Row>
            );
        });
        
        return listItems;
    }

    private renderReview(): JSX.Element {
        const { t } = this.props;
        const { failedImports } = this.state;

        return(
            <div className='workshop-import-container'>
                {failedImports.length === 0
                ? (<span className='import-success'>
                    <Icon name='feedback-success' />{t('Import successful')}
                </span>)
                : (<span className='import-errors'>
                    <Icon name='feedback-error' />{t('Import successful')}
                </span>)
                }
            </div>
        );
    }

    private isModEnabled(mod: ISteamWorkshopEntry): boolean {
        return (this.state.importEnabled[mod.publishedfileid] && this.state.importEnabled[mod.publishedfileid] !== false);
    }

    private genActions(): ITableRowAction[] {
        return [
            {
                icon: 'checkbox-checked',
                title: 'Import',
                action: (instanceIds: string[]) => {
                    instanceIds.forEach(id => this.nextState.importEnabled[id] = true);
                    ++this.nextState.counter;
                },
                singleRowAction: false
            },
            {
                icon: 'checkbox-unchecked',
                title: 'Skip',
                action: (instanceIds: string[]) => {
                    instanceIds.forEach(id => this.nextState.importEnabled[id] = false);
                    ++this.nextState.counter;
                },
                singleRowAction: false
            }
        ];
    }

    private genAttributes(): Array<types.ITableAttribute<ISteamWorkshopEntry>> {
        return [
            {
                id: 'status',
                name: 'Import',
                description: 'The import status of this mod.',
                icon: 'level-up',
                calc: mod => this.isModEnabled(mod) ? 'Import' : 'Skip',
                placement: 'table',
                isToggleable: true,
                isSortable: true,
                isVolatile: true,
                edit: {
                    inline: true,
                    choices: () => [
                        { key: 'yes', text: 'Import' },
                        { key:'no', text: 'Skip' }
                    ],
                    onChangeValue: (mod: ISteamWorkshopEntry, value: any) => {
                        // If the key does exist or is false, set it to true.
                        this.nextState.importEnabled[mod.publishedfileid] = !(!!this.state.importEnabled[mod.publishedfileid] && this.state.importEnabled[mod.publishedfileid] !== false);
                        ++this.nextState.counter;
                    }
                }
            },
            {
                id: 'name',
                name: 'Mod Name',
                description: 'The mod title.',
                icon: 'quote-left',
                calc: (mod: ISteamWorkshopEntry) => mod.title,
                placement: 'both',
                isToggleable: true,
                isSortable: true,
                filter: new TableTextFilter(true),
                edit: {},
                sortFunc: (lhs: string, rhs: string, locale: string): number => {
                    return lhs.localeCompare(rhs, locale, { sensitivity: 'base' });
                }
            },
            {
                id: 'exists',
                name: 'Already Imported',
                description: 'Has this mod already been imported?',
                icon: 'level-up',
                customRenderer: (mod: ISteamWorkshopEntry, detail: boolean) => {
                    return mod.isAlreadyManaged ? (
                        <tooltip.Icon 
                            id={`already-managed=${mod.publishedfileid}`}
                            tooltip={'This mod has already been imported. \nImporting it again will overwrite the current entry.'}
                            name='feedback-warning'
                        />
                    ) : null;
                },
                calc: mod => mod.isAlreadyManaged,
                placement: 'table',
                isToggleable: true,
                isSortable: true,
                edit: {}
            },
            {
                id: 'id',
                name: 'Workshop ID',
                description: 'The Steam Workshop ID of this mod.',
                icon: 'id-badge',
                calc: (mod: ISteamWorkshopEntry) => {
                    try {
                        return parseInt(mod.publishedfileid);
                    }
                    catch(err) {
                        return 0;
                    }
                },
                placement: 'both',
                isToggleable: true,
                isSortable: true,
                isDefaultVisible: false,
                edit: {}
            },
        ];
    }

}

function convertWorkshopMods(mods: ISteamWorkshopEntry[], vortexMods: {[id: string] : types.IMod}): {[id: string] : ISteamWorkshopEntry} {
    const mappedObject = {};
    if (!mods || !mods.length) return mappedObject;
    mods.map(mod => {
        mappedObject[mod.publishedfileid] = mod
        if (!!vortexMods[`steam-${mod.publishedfileid}`]) mappedObject[mod.publishedfileid].isAlreadyManaged = true;
        return mod;
    });
    return mappedObject;
}


function mapStateToProps(state: types.IState): IConnectedProps {
    const gameId = selectors.activeGameId(state);
    const steamAppId = selectors.gameById(state, gameId).details.steamAppId;
    return {
      steamAppId,
      gameId,
      discovered: util.getSafe(state, ['settings', 'gameMode', 'discovered'], {}),
      mods: util.getSafe(state, ['persistent', 'mods', gameId], {})
    };
  }
  
  function mapDispatchToProps(dispatch: Redux.Dispatch<any>): IActionProps {
    return {
    };
  }
  
  export default withTranslation([ 'common' ])(
    connect(mapStateToProps, mapDispatchToProps)(
      ImportDialog) as any) as React.ComponentClass<IBaseProps>;