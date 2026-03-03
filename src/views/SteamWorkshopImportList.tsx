import React from 'react';
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
}

export default function WorkshopModsList({ t, workshopMods, state, selected, setSelected, rescan, exists, networkConnected }: IProps) {

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
            const all = new Set(Object.keys(workshopMods));
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
    exists: boolean
}

function WorkshopModRow({ t, state, mod, selected, setSelected, exists }: IRowProps) {
    
    const { 
        title, publishedfileid: version, files, 
        file_size, time_installed
    } = mod;

    const installTime = util.relativeTime(new Date(time_installed * 1000), t);
    const size = util.bytesToString(file_size || 0);

    const classNames = ['row', 'body'];
    if (exists) classNames.push('imported');

    return (
        <div className={classNames.join(' ')} style={{ opacity: exists ? '0.4' : '1' }}>
            <div className='checkbox'>
                { exists && <span title={'Already imported'}><Icon name='toggle-enabled' /></span> }
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
            <div className='modInfo'>
                <div className='modMeta'>{t('Files: {{total}} | Size: {{fileSize}}', { total: files?.length ?? 0, fileSize: size })}</div>
                <div className='modMeta' title={installTime.toString()}>{t('Installed: {{time}}', { time: installTime })}</div>
            </div>
        </div>
    )
}