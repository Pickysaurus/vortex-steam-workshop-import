import { ISteamWorkshopEntry } from "../types/workshopEntries";

export type IMockedMod = {
    id: string;
    state: 'installed'
    type: '',
    installationPath: string;
    attributes: {
        name: string;
        author: string;
        description: string;
        pictureUrl: string | undefined;
        installTime: string;
        version: string;
        notes: string;
        steamWorkshopId: string;
        fileMD5?: string;
        fileName?: string;
        fileSize?: number;
    }
    archiveId?: string;
}

export function toVortexMod(mod: ISteamWorkshopEntry, vortexId: string) : IMockedMod {
    const vortexMod: IMockedMod = {
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