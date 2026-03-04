import React, { useEffect, useRef, useState } from 'react';
import { TFunction } from "vortex-api/lib/util/i18n";
import { ISteamWorkshopEntry } from "../types/workshopEntries";
import Button from './Button'
import { Icon, util } from "vortex-api";

interface IProps {
    t: TFunction;
    workshopMods: { [id: string]: ISteamWorkshopEntry };
    selected: Set<string>;
    toggleWatcher: (enable: boolean) => void;
    deleteMod: (id: string) => void;
}

export default function SteamWorkshopImportReview({ t, workshopMods, selected, deleteMod, toggleWatcher }: IProps) {

    if (!selected.size) return (
        <div>
            {t('All mods imported, you may now close this window.')}
        </div>
    )
    
    return (
        <div className='bethesda-import-table'>
            <div>
                {t('Unsubscribe or delete mods')}
            </div>
            {[...selected].map(s => (
                <RemoveModRow 
                    key={s} 
                    mod={workshopMods[s]} 
                    deleteManually={() => deleteMod?.(s)}
                />
            ))}
        </div>
    )

}

interface IRemoveProps {
    mod: ISteamWorkshopEntry;
    deleteManually: () => void;
}

function RemoveModRow({ mod, deleteManually }: IRemoveProps) {
    const [showFallback, setShowFallback] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const base = `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.publishedfileid}`
    const steamAppUrl = `steam://openurl/${base}`;

    const openUrl = (uri: string) => util.opn(uri).catch(() => undefined);

    const onClickUnsub = () => {
        openUrl(steamAppUrl);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setShowFallback(true);
        }, 2500);
    }

    useEffect(() => {
     return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
     }   
    }, []);

    return (
        <div className="row body">
            <div>
                <img src={mod.preview_url} style={{maxWidth: '50px', maxHeight: '50px'}} />
            </div>
            <div>
                <a onClick={() =>openUrl(base)}>{mod.title}</a>
            </div>
            <div>
                {!showFallback && <Button onClick={onClickUnsub}>
                    <Icon name='open-in-browser' />
                    Unsubscribe
                </Button>}
                {showFallback && <Button onClick={deleteManually} className='btn-danger'>
                    <Icon name='toggle-uninstalled' />
                    Delete Manually
                </Button>}
            </div>
        </div>
    )
}