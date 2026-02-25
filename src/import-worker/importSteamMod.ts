import { types } from "vortex-api";
import { ISteamWorkshopEntry } from "../types/workshopEntries";

export function toVortexMod(mod: ISteamWorkshopEntry, vortexId: string) : types.IMod {
    const vortexMod: types.IMod = {
        id: vortexId,
        state: 'installed',
        type: '',
        installationPath: vortexId,
        attributes: {
            name: mod.title,
            author: 'Steam Workshop',
            description: mod.description,
            pictureUrl: mod.preview_url,
            installTime: new Date().toString(),
            version: '1.0.0',
            notes: 'Imported from Steam Workshop',
            steamWorkshopId: mod.publishedfileid
        }
    };
    return vortexMod;
}