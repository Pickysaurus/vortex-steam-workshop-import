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
    const game = selectors.gameById(state, gameId);
    const steamAppId = util.getSafe(game, [ 'details', 'steamAppId' ], undefined);
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