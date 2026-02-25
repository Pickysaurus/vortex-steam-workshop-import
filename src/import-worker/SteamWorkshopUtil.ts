import fs from 'fs';
import path from "path";
import { ISteamWorkshopEntry } from '../types/workshopEntries';

type WorkshopModsResult =
    | { path: string, mods: { [id: string]: ISteamWorkshopEntry }, error: null }
    | { path: null, error: WorkshopErrorType, detail?: string };

type WorkshopErrorType = 'NON_STEAM' | 'NO_WORKSHOP' | 'UNKNOWN' | 'STEAM_API_ERROR';

interface ISteamWorkshopAPIResponse {
    response: {
        publishedfiledetails?: ISteamWorkshopEntry[];
    }
}

const STEAM_API = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/'

export async function findWorkshopMods(gamePath: string, steamAppId: number): Promise<WorkshopModsResult> {
    if (!steamAppId) return { path: null, error: 'NON_STEAM', detail: 'No Steam App ID in game extension' };

    const steamAppsIdx = gamePath.toLowerCase().indexOf('steamapps');
    if (steamAppsIdx === -1) return { path: null, error: 'NON_STEAM', detail: `SteamApps is not in path: ${gamePath}` };

    const steamAppsPath = gamePath.substring(0, steamAppsIdx + 9);
    const workshopFolder = path.join(steamAppsPath, 'workshop', 'content', String(steamAppId));

    try {
        await fs.promises.access(workshopFolder);
    }
    catch(err: unknown) {
        return { path: null, error: 'NO_WORKSHOP', detail: `Error accessing path ${workshopFolder}: ${(err as Error)?.message}` };
    }

    // If we found a workshop folder, we can now start parsing the mods.
    try {
        const directory = await fs.promises.readdir(workshopFolder);
        // Only select folders with numerical IDs
        const ids = directory.filter(d => !path.extname(d) && d.match(/[0-9]+/));
        if (!ids.length) return { path: workshopFolder, mods: {}, error: null };

        // Get details from the Steam API
        const form = new FormData();
        form.append('itemcount', String(ids.length));
        for (const id in ids) form.append(`publishedfileids[${ids.indexOf(id)}]`, String(id));

        const postRes = await fetch(STEAM_API, {
            method: 'POST',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
            }, 
            body: form,
        });

        if (!postRes.ok) return { path: null, error: 'STEAM_API_ERROR', detail: `HTTP ${postRes.status} - ${postRes.statusText ?? 'No status message'}` };

        const json: ISteamWorkshopAPIResponse = await postRes.json();
        const apiMods = json.response?.publishedfiledetails;
        if (!apiMods) return { path: null, error: 'UNKNOWN', detail: `Unexpected API response, ${JSON.stringify(json)}` };
        const mods = ids.reduce((prev, cur) => {
            let mod = apiMods.find(m => m.publishedfileid === cur);
            if (!mod) {
                mod = { 
                    publishedfileid: cur, 
                    creator: 'Unknown', 
                    result: 0, 
                    creator_app_id: Number(cur), 
                    consumer_app_id: Number(cur), 
                    time_created: new Date(), 
                    time_updated: new Date(), 
                    title: `Unknown mod ${cur}`, 
                    description: '', 
                    isAlreadyManaged: false 
                };
            }
            prev[cur] = mod;
            return prev;
        }, {} as { [id: string]: ISteamWorkshopEntry });

        return { path: workshopFolder, mods, error: null };
    }
    catch(err) {
        return { path: null, error: 'UNKNOWN', detail: `Unknown error: ${(err as Error)?.message}` }
    }
}