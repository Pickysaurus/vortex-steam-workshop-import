import React, { useEffect, useRef, useState } from 'react';
import { Icon, Spinner, util } from 'vortex-api';
import Button from './Button';
import { ISteamWorkshopEntry } from '../types/workshopEntries';
import { TFunction } from "vortex-api/lib/util/i18n";

interface IProps {
    t: TFunction;
    state: 'loading' | 'importing' | 'ready' | 'review';
    workshopMods: { [id: string]: ISteamWorkshopEntry };
    selected: Set<string>;
    setSelected: (newSelection: Set<string>) => void;
    disabled: boolean;
    rescan: () => void;
    exists: (id: string) => boolean;
    networkConnected: boolean,
    deleteMod: (id: string | number) => void;
}

export default function WorkshopModsList({ 
    t, workshopMods, state, 
    selected, setSelected, rescan, 
    exists, networkConnected,
    deleteMod
}: IProps) {

    const mods = workshopMods ? Object.values(workshopMods) : [];

    const toggleSelect = (id: string) => {
        const updated = new Set(selected);
        if (!updated.has(id)) updated.add(id);
        else updated.delete(id);
        setSelected(updated);
    }

    const toggleAll = () => {
        if (selected.size > 0) {
            setSelected(new Set());
        }
        else {
            const readyToImport = Object.keys(workshopMods).filter(k => !exists(k));
            const all = new Set(readyToImport);
            setSelected(all);
        }
    }

    return (
        <div>
        <div className='bethesda-import-table'>
            <div className='row header'>
                <div>
                    <button onClick={toggleAll} title={selected.size ? 'Select none' : 'Select all'}>
                        <Icon name={selected.size ? 'remove' : 'add'} />
                    </button>
                </div>
                <div>{t('Name')}</div>
                <div>{t('Metadata')}</div>
            </div>
            { state === 'loading' && (
                <div className='cover' style={{padding: '8px 16px'}}>
                    <img 
                        src={`file://${__dirname}/steam.png`} 
                        className='loading-pulse' 
                    />
                    <p>{t('Getting Steam Workshop mod information...')}</p>
                </div>
            )}
            { workshopMods && mods.length === 0 && (
                <div className='cover' style={{ flexDirection: 'column', padding: '8px 16px' }}>
                    <p>{ t('No Steam Workshop Mods detected') }</p>
                    <Button onClick={() => rescan()} disabled={!networkConnected}>
                        <Icon name='refresh' /> {t('Check again')}
                    </Button>
                </div>
            ) }
            {mods.map(m => (
                <WorkshopModRow 
                    t={t}
                    key={m.publishedfileid} 
                    state={state}
                    mod={m} 
                    selected={selected.has(m.publishedfileid)}
                    setSelected={() => toggleSelect(m.publishedfileid)}
                    exists={exists(`steamworkshop-${m.publishedfileid}`)}
                    deleteManually={() => deleteMod(m.publishedfileid)}
                />
            ))}
        </div>
        </div>
    )
}

interface IRowProps {
    t: TFunction;
    state: 'loading' | 'importing' | 'ready' | 'review';
    mod: ISteamWorkshopEntry, 
    selected: boolean, 
    setSelected: () => void,
    exists: boolean,
    deleteManually: () => void,
}

function WorkshopModRow({ t, state, mod, selected, setSelected, exists, deleteManually }: IRowProps) {
    const [showFallback, setShowFallback] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const base = `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.publishedfileid}`
    const steamAppUrl = `steam://openurl/${base}`;

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        }   
    }, []);
    
    const { 
        title, publishedfileid: version, files, 
        file_size, time_installed
    } = mod;

    const installedAt = new Date(time_installed * 1000)
    const installTime = util.relativeTime(installedAt, t);
    const size = util.bytesToString(file_size || 0);

    const classNames = ['row', 'body'];

    const openUrl = (uri: string) => util.opn(uri).catch(() => undefined);
    
    const onClickUnsub = () => {
        openUrl(steamAppUrl);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setShowFallback(true);
        }, 5000);
    }

    return (
        <div className={classNames.join(' ')} style={{ opacity: exists ? '0.4' : '1' }}>
            <div className='checkbox'>
                { exists && <span title={t('Already imported')}><Icon name='toggle-enabled' /></span> }
                { (state === 'importing' && selected && !exists) && <Spinner /> }
                { (state !== 'importing' || (state === 'importing' && !selected)) && !exists && (
                    <input 
                        type='checkbox'
                        checked={selected}
                        onChange={() => setSelected()}
                        disabled={['importing', 'loading'].includes(state)}
                    />
                )}
            </div>
            <div className='modInfo'>
                <div className='modName'>{ title }</div>
                <div className='modMeta'>{t('Version: {{version}}', { version })}</div>
            </div>
            {!exists && <div className='modInfo'>
                <div className='modMeta' title={files.join('\n')}>{t('Files: {{total}} | Size: {{fileSize}}', { total: files?.length ?? 0, fileSize: size })}</div>
                <div className='modMeta' title={installedAt.toLocaleString()}>{t('Installed: {{time}}', { time: installTime })}</div>
            </div>}
            {exists && <div className='modInfo'>
                <div>
                    {!showFallback && <Button onClick={onClickUnsub} title={t('Open Steam to unsubscribe from the Workshop item')}>
                        <Icon name='open-in-browser' style={{ marginRight: '4px' }} />
                        {t('Unsubscribe')}
                    </Button>}
                    {showFallback && <Button onClick={deleteManually} title={t('If unsubscribing fails, you can also delete the file manually, but Steam may redownload it later.')} className='btn-danger'>
                        <Icon name='toggle-uninstalled' style={{ marginRight: '4px' }} />
                        {t('Delete Manually')}
                    </Button>}
                </div>
            </div>}
        </div>
    )
}