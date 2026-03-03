import { TFunction } from "vortex-api/lib/util/i18n";
import { ISteamWorkshopEntry } from "../types/workshopEntries";
import Button from './Button'
import { Icon, util } from "vortex-api";

interface IProps {
    t: TFunction;
    workshopMods: { [id: string]: ISteamWorkshopEntry };
    selected: Set<string>;
    deleteManually?: (id: string) => void;
}

export default function SteamWorkshopImportReview({ t, workshopMods, selected, deleteManually }: IProps) {

    return (
        <div>
            <div>
                {t('Unsubscribe or delete mods')}
            </div>
            {[...selected].map(s => (
                <RemoveModRow 
                    key={s} 
                    mod={workshopMods[s]} 
                    deleteManually={() => deleteManually?.(s)}
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
    const base = `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.publishedfileid}`
    const steamAppUrl = `steam://openurl/${base}`;

    const openUrl = (uri: string) => util.opn(uri).catch(() => undefined);

    return (
        <div className="row body">
            <div>
                <img src={mod.preview_url} style={{maxWidth: '50px', maxHeight: '50px'}} />
            </div>
            <div>
                <a onClick={() =>openUrl(base)}>{mod.title}</a>
            </div>
            <div>
                <Button onClick={() => openUrl(steamAppUrl)}>
                    <Icon name='' />
                    Unsubscribe
                </Button>
                <Button onClick={deleteManually}>
                    <Icon name='' />
                    Delete Manually
                </Button>
            </div>
        </div>
    )
}