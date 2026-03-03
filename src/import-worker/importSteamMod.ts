import { ISteamWorkshopEntry } from "../types/workshopEntries";

export type IMockedMod = {
    id: string;
    state: 'installed'
    type: '',
    installationPath: string;
    attributes: {
        name: string;
        logicalFileName: string;
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
        archiveId: '', //mod.archiveId, // Added if we create an archive
        attributes: {
            name: mod.title,
            logicalFileName: mod.title,
            author: 'Steam Workshop',
            installTime: new Date().toString(),
            version: mod.publishedfileid,
            shortDescription: 'Imported from Bethesda.net',
            description: mod.description,
            pictureUrl: mod.preview_url,
            notes: `Imported from Steam Workshop ${new Date().toLocaleDateString()}`,
            modId: mod.publishedfileid,
            fileMD5: '', // mod.md5hash, // Added if we create an archive
            fileName: '', // Added if we create an archive!
            source: 'website',
            url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.publishedfileid}`,
            fileSize: 0, // Added if we create an archive
            steamWorkshopId: mod.publishedfileid
        },
    };

    return vortexMod;
}