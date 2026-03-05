import { Icon, Modal, Spinner, util } from 'vortex-api';
import React from "react";
import { useTranslation } from 'react-i18next';
import useSteamWorkshopImport from '../hooks/useSteamWorkshopImport';
import WorkshopModsList from './SteamWorkshopImportList';
import ImportProgressBar from './ProgressBar';
import ErrorAlert from './ErrorAlert';
import Button from './Button';

interface IProps {
    visible: boolean;
    onHide: () => void;
}

const secondaryButtonStyle: React.CSSProperties = {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,.5)',
    color: 'rgba(255,255,255,.5)',
}

export default function SteamWorkshopImport({ visible, onHide }: IProps) {
    const { t } = useTranslation([ 'common' ]);
    const {
        networkConnected, workshopPath,
        mods, error, selected, tableState,
        scanResults, setSelected,
        progress, createArchives, 
        setCreateArchives, manuallyDeleteMod,
        startImport, startScan, cancel
    } = useSteamWorkshopImport(visible);

    const canCancel = true;

    return (
        <Modal id='steam-workshop-import' show={visible}>
            <Modal.Header>
                <h2>{t('Import Steam Workshop Mods to Vortex')}</h2>
            </Modal.Header>
            <Modal.Body>
                <div style={{marginBottom: '8px'}}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <img src={`file://${__dirname}/steam-to-vortex.png`} style={{ maxHeight: '75px' }} />
                    </div>
                    <p>{t('This tool will allow you to import mods installed through Steam Workshop into Vortex.')}</p>
                    <p>{t('After importing a mod to Vortex, you should unsubscribe from the Steam Workshop page to prevent possible conflicts.')}</p>
                </div>
                <WorkshopModsList 
                    t={t}
                    state={tableState}
                    workshopMods={scanResults}
                    selected={selected}
                    setSelected={setSelected}
                    disabled={false}
                    rescan={startScan}
                    exists={(id) => !!mods?.[id]}
                    networkConnected={networkConnected}
                    deleteMod={manuallyDeleteMod}
                />
                {error && (
                    <ErrorAlert title={error.title} detail={error.detail} />
                )}
                <ImportProgressBar {...progress} />
                <div style={{display: 'flex', gap: 4, justifyContent: 'start', justifyItems: 'start', marginTop: '4px' }}>
                    <Button 
                        onClick={startImport} 
                        disabled={selected.size === 0 && tableState !== 'importing'}
                        style={{color: 'black'}}
                    >
                        {tableState === 'importing' ? <Spinner style={{ marginRight: '4px' }} /> : <Icon name='import' style={{ marginRight: '4px' }} />}
                        {t('Import {{selected}} Mod(s)', { selected: selected.size })}
                    </Button>
                    <Button 
                        onClick={startScan} 
                        title={t('Re-Scan')} 
                        disabled={tableState !== 'ready'} 
                        className='btn-secondary' 
                        style={secondaryButtonStyle}
                    >
                        <Icon name='refresh' />
                    </Button>
                    <Button
                        onClick={() => util.opn(workshopPath).catch(() => undefined)}
                        title={workshopPath ? t(`Open Steam Workshop folder at ${workshopPath}`) : t('Workshop folder not found.')}
                        disabled={!workshopPath}
                        className='btn-secondary'
                        style={secondaryButtonStyle}
                    >
                        <Icon name='open-in-browser' style={{ marginRight: '4px' }} />
                        {t('Open Folder')}
                    </Button>
                    <Button 
                        onClick={() => cancel()} 
                        disabled={tableState === 'ready'} 
                        className='btn-secondary' 
                        style={secondaryButtonStyle}
                    >
                        <Icon name='window-close' style={{ marginRight: '4px' }} />
                        {t('Cancel')}
                    </Button>
                </div>
                <div>
                    <label>
                    <input 
                        type='checkbox'
                        checked={createArchives}
                        onChange={() => setCreateArchives(!createArchives)}
                    />
                    {t('Create ZIP archives for imported mods in the downloads folder')}
                    </label>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button disabled={tableState === 'importing'} onClick={() => onHide()}>{t('Close')}</Button>
            </Modal.Footer>
        </Modal>
    )
}
