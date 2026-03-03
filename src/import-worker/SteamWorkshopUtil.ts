import fs from 'fs';
import path from "path";
import yazl from 'yazl';
import { ISteamGameInfoResponse, ISteamWorkshopEntry } from '../types/workshopEntries';
import { ImportEvent } from '../types/importEvents';
import { IMockedMod, toVortexMod } from './importSteamMod';
import { createHash, randomBytes } from 'crypto';

type WorkshopModsResult =
    | { path: string, mods: { [id: string]: ISteamWorkshopEntry }, error: null }
    | { path: null, error: WorkshopErrorType, detail?: string };

type WorkshopErrorType = 'NON_STEAM' | 'NO_WORKSHOP' | 'NO_WORKSHOP_FOLDER' | 'UNKNOWN' | 'STEAM_API_ERROR';

interface ISteamWorkshopAPIResponse {
    response: {
        publishedfiledetails?: ISteamWorkshopEntry[];
    }
}

const STEAM_API = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';

type ImportStage = 'import-files' | 'create-archive' | 'remove-files';

export class ImportSteamWorkshopModError extends Error {
    public stage: ImportStage;
    public fileErrors?:  { [id: string]: string }

    constructor(stage: ImportStage, mainError: string, modName: string, fileErrors?: { [id: string]: string }) {
        super(`Error importing ${modName || 'Mod'}: ${mainError ?? 'Unknown'}`);
        this.stage = stage;
        this.fileErrors = fileErrors;
    }
}

export async function findWorkshopMods(gamePath: string, steamAppId: number, send?: (ev: ImportEvent<any>) => void): Promise<WorkshopModsResult> {
    if (!steamAppId) return { path: null, error: 'NON_STEAM', detail: 'No Steam App ID in game extension' };

    const steamAppsIdx = gamePath.toLowerCase().indexOf('steamapps');
    if (steamAppsIdx === -1) return { path: null, error: 'NON_STEAM', detail: `SteamApps is not in path: ${gamePath}` };

    // Check if this game even supports Steam Workshop
    const hasWorkshop = await hasSteamWorkshop(steamAppId, send);
    send?.({ type: 'message', level: 'debug', message: `Has Steam Workshop ${hasWorkshop ? 'TRUE' : 'FALSE'}` })
    if (!hasWorkshop) return { path: null, error: 'NO_WORKSHOP', detail: 'Compatible games must include the "Steam Workshop" tag on the Steam store page.' };

    const steamAppsPath = gamePath.substring(0, steamAppsIdx + 9);
    const workshopFolder = path.join(steamAppsPath, 'workshop', 'content', String(steamAppId));

    try {
        await fs.promises.access(workshopFolder);
    }
    catch(err: unknown) {
        return { path: null, error: 'NO_WORKSHOP_FOLDER', detail: `Error accessing path ${workshopFolder}: ${(err as Error)?.message}` };
    }

    // If we found a workshop folder, we can now start parsing the mods.
    try {
        const directory = await fs.promises.readdir(workshopFolder);
        // Only select folders with numerical IDs
        const ids = directory.filter(d => !path.extname(d) && d.match(/[0-9]+/));
        if (!ids.length) return { path: workshopFolder, mods: {}, error: null };

        // Get details from the Steam API
        const body = new URLSearchParams();
        body.append('itemcount', String(ids.length));
        ids.forEach((id, i) => {
            body.append(`publishedfileids[${i}]`, String(id));
        });

        
        const postRes = await fetch(STEAM_API, {
            method: 'POST',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
            }, 
            body,
        });

        if (!postRes.ok) return { path: null, error: 'STEAM_API_ERROR', detail: `HTTP ${postRes.status} - ${postRes.statusText ?? 'No status message'}` };

        const json: ISteamWorkshopAPIResponse = await postRes.json();
        const apiMods = json.response?.publishedfiledetails;
        if (!apiMods) return { path: null, error: 'UNKNOWN', detail: `Unexpected API response, ${JSON.stringify(json)}` };
        let mods: { [id: string]: ISteamWorkshopEntry } = {};
        for (const cur of ids) {
            let mod = apiMods.find(m => m.publishedfileid === cur);
            const modPath = path.join(workshopFolder, cur);
            const pathStat = await fs.promises.stat(modPath);
            const modFiles = await fs.promises.readdir(modPath, { recursive: true });
            if (!mod) {
                mod = { 
                    publishedfileid: cur, 
                    creator: 'Unknown', 
                    result: 0, 
                    creator_app_id: Number(cur), 
                    consumer_app_id: Number(cur), 
                    time_created: new Date().getTime(), 
                    time_updated: new Date().getTime(), 
                    title: `Unknown mod ${cur}`, 
                    description: '', 
                    isAlreadyManaged: false 
                };
            }
            mod.time_installed = Math.floor(pathStat.ctimeMs / 1000);
            mod.api_data = !!mod;
            mod.files = modFiles;
            mod.file_size = await determineModSize(modPath, modFiles);
            mods[cur] = mod;
        }

        return { path: workshopFolder, mods, error: null };
    }
    catch(err) {
        return { path: null, error: 'UNKNOWN', detail: `Unknown error: ${(err as Error)?.message}` }
    }
}

async function hasSteamWorkshop(steamAppId: number, send?: (ev: ImportEvent<any>) => void): Promise<boolean> {
    const steamApi = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}`;
    
    try {
        const res = await fetch(steamApi);
        if (!res.ok) return false;
        const json: ISteamGameInfoResponse = await res.json();
        const gameInfo = json[steamAppId];
        return !!gameInfo && gameInfo.success && !!gameInfo.data?.categories?.find(c => c.id === 30);

    }
    catch(e: unknown) {
        send?.({ type: 'message', level: 'error', message: `Error getting Steam Workshop data: ${(e as Error)?.message} ${(e as Error).cause}` });
        return true;
    }
}

async function determineModSize(basePath: string, files: string[]): Promise<number | undefined> {
    try {
    const stats = await Promise.allSettled((files.map(async (f) => {
        const stat = await fs.promises.stat(path.join(basePath, f));
        return stat.size;
    })));
    return stats.filter(s => s.status === 'fulfilled').reduce((cur, acc) => acc.value += cur, 0);
    }
    catch(e: unknown) {
        return undefined;
    }
}

export async function importModToStagingFolder(
    vortexId: string, mod: ISteamWorkshopEntry, stagingFolderPath: string, workshopPath: string,
    progress: ImportEvent<ReturnType<typeof toVortexMod>>, send: (ev: ImportEvent<ReturnType<typeof toVortexMod>>) => void
): Promise<IMockedMod> {
    const modPath = path.join(workshopPath, mod.publishedfileid);
    const failedImports: { [id: string]: string } = {};
    try {
        // Create a staging folder
        const stat = await fs.promises.stat(stagingFolderPath).catch(() => undefined);
        if (!stat) await fs.promises.mkdir(stagingFolderPath);

        // Get a list of files to copy
        const files = await fs.promises.readdir(modPath, { recursive: true });

        // Import the files
        for (const file of files) {
            const src = path.join(modPath, file);
            const dest = path.join(stagingFolderPath, file);
            // Report progress
            const newProgress = {
                ...progress,
                message: `Importing "${mod.title}"...`, 
                detail: `Coping file "${file}"...`
            }
            send?.(newProgress);

            // Copy the file
            try {
                await fs.promises.copyFile(src, dest);
            }
            catch(e: unknown) {
                failedImports[file] = (e as Error).message;
            }
        }

        if (Object.keys(failedImports).length) {
            // Delete the staging folder and report the error
            await fs.promises.rm(stagingFolderPath, { recursive: true }).catch(() => undefined);
            throw new ImportSteamWorkshopModError(
                'import-files',
                'Error copying files to staging folder',
                mod.title,
                failedImports
            );
        }

        const vortexMod = toVortexMod(mod, vortexId);
        return vortexMod;

    } 
    catch(e: unknown) {
        // Remove the staging folder if we managed to create it
        await fs.promises.rm(stagingFolderPath, { recursive: true }).catch(() => undefined);
        // If it's an error we throw, just pass it on, otherwise reformat it.
        if (e instanceof ImportSteamWorkshopModError) throw e;
        throw new ImportSteamWorkshopModError('import-files', (e as Error).message, mod.title);
    }
}

export async function createArchiveForMod(
    id: string, stagingFolderPath: string, downloadFolder: string, 
    vortexMod: IMockedMod, workshopMod: ISteamWorkshopEntry,
    send: (ev: ImportEvent<IMockedMod>) => void, importProgress: ImportEvent<IMockedMod>
): Promise<IMockedMod> {
    const dest = path.join(downloadFolder, `${id}.zip`);
    let newProgress = {
        ...importProgress,
        detail: 'Creating archive'
    }
    send(newProgress);
    try {
        const files = await fs.promises.readdir(stagingFolderPath);
        const zipList = files.map(f => ({ abs: path.join(stagingFolderPath, f), zip: f }));
        const zip = new yazl.ZipFile();
        for (const zipFile of zipList) {
            zip.addFile(zipFile.abs, zipFile.zip);
        }
        // Write out the zip file
        await new Promise<void>((resolve, reject) => {
            const out = fs.createWriteStream(dest);

            out.on('error', reject);
            out.on('close', resolve);

            zip.outputStream.on('error', reject);
            zip.outputStream.pipe(out);

            zip.end();
        });

        // Generate a UID and hash the archive
        const archiveId = randomBytes(8).toString('hex');
        vortexMod.archiveId = archiveId;
        newProgress.detail = 'Creating archive MD5 hash'
        send(newProgress);
        const hash = await new Promise<string>((resolve, reject) => {
            const hash = createHash('md5');
            const stream = fs.createReadStream(dest);
            stream.on('error', reject);
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
        vortexMod.attributes.fileMD5 = hash;
        const stat = await fs.promises.stat(dest);
        vortexMod.attributes.fileSize = stat.size;
        vortexMod.attributes.fileName = path.basename(dest);

        newProgress.detail = 'Moving archive to downloads';
        send(newProgress);

        return vortexMod;
    }
    catch(e: unknown) {
        await fs.promises.unlink(dest).catch(() => undefined);
        throw new ImportSteamWorkshopModError('create-archive', 'Failed to pack archive: '+(e as Error).message, workshopMod.title);
    }
}

export async function removeWorkshopInstanceOfMod() {

}