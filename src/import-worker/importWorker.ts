import path from 'path';
import { ImportEvent, ImportMessage } from '../types/importEvents';
import { 
    // createArchiveForCreation, 
    // importCreationToStagingFolder, 
    // removeCreationFilesFromData, 
    toVortexMod,
    // ImportCreationError
} from './importSteamMod';
import { createArchiveForMod, findWorkshopMods, importModToStagingFolder, ImportSteamWorkshopModError } from './SteamWorkshopUtil';
import { ISteamWorkshopEntry } from '../types/workshopEntries';

let cancelled = false;

function send(ev: ImportEvent<ReturnType<typeof toVortexMod>>) {
    process.send?.(ev);
}

async function scan(gamePath: string, steamAppId: number) {
    send({ type: 'message', level: 'info', message: `Scan props ${gamePath} ${steamAppId}` })
    cancelled = false;
    const errors: string[] = [];
    // Mod import
    try {
        const workshopMods = await findWorkshopMods(gamePath, steamAppId);
        if (workshopMods.error) {
            switch (workshopMods.error) {
                case 'NON_STEAM': throw new Error(`This game does not appear to installed via Steam. ${workshopMods.detail}`);
                case 'NO_WORKSHOP': throw new Error(`The Steam Workshop folder for this game does not exist. ${workshopMods.detail}`);
                case 'UNKNOWN': throw new Error(`Unexpected error: ${workshopMods.detail}`);
                case 'STEAM_API_ERROR': throw new Error(`Steam API error: ${workshopMods.detail}`);
                default: throw new Error(`Unknown Workshop error: ${workshopMods satisfies never}`);
            }
        }
        send({ type: 'scancomplete', total: Object.keys(workshopMods.mods).length, mods: workshopMods.mods, errors })
    }
    catch(err) {
        send?.({ type: 'fatal', error: `Unable to detect Steam Workshop Mods: ${(err as Error).message}` });
    }
}

async function importMods(
    importIds: string[], gamePath: string, gameId: string, steamAppId: number,
    stagingFolder: string, downloadFolder: string, 
    createArchives: boolean
) {
    cancelled = false;
    send({ type: 'message', level: 'info', message: `Starting Steam Workshop import for ${gameId} with IDs ${importIds.join(', ')}` });
    send({
        type: 'importprogress',
        message: `Preparing to import ${importIds.length} mods(s)...`, 
        total: importIds.length, done: 0
    })
    let errors: string[] = [];
    const workshopMods = await findWorkshopMods(gamePath, steamAppId);
    if (workshopMods.error) return send({ type: 'fatal', error: `Unexpected error during import: ${workshopMods.error}` });

    const workshopPath: string = workshopMods.path;
    const modsToImport: ISteamWorkshopEntry[] = Object.values(workshopMods.mods).filter(m => importIds.includes(m.publishedfileid));
    const successful: string[] = [];
    try {
        for (const mod of modsToImport) {
            if (cancelled) throw new Error('User Cancelled');
            const idx = modsToImport.indexOf(mod);
            const vortexId = `steamworkshop-${mod.publishedfileid}`;
            const stagingFolderPath = path.join(stagingFolder, vortexId);

            const progress: ImportEvent = {
                type: 'importprogress',
                message: `Importing "${mod.title}"...`, 
                detail: '',
                done: idx,
                total: modsToImport.length
            }

            try {
                let vortexMod = await importModToStagingFolder(
                    vortexId, mod,
                    stagingFolderPath, workshopPath, 
                    progress, send
                );
                // Create a backup archive
                if (createArchives === true) {
                    vortexMod = await createArchiveForMod(
                        vortexId, stagingFolderPath, downloadFolder,
                        vortexMod, mod, send, progress
                    );
                }
                // Send the mod info we have back to the UI.
                send({ type: 'importedmod', mod: vortexMod });
                // Clean up the files that we've copied
                // await removeCreationFilesFromData(
                //     mod, gamePath, stagingFolderPath, 
                //     send, progress
                // );
                successful.push(mod.publishedfileid);
            }
            catch(err: unknown) {
                if (err instanceof ImportSteamWorkshopModError) {
                    if (err.stage === 'import-files' || err.stage === 'remove-files') {
                        let error = err.message;
                        if (err.fileErrors) {
                            const fileErrors = Object.entries(err.fileErrors).reduce((prev, cur) => {
                                const [key, error] = cur;
                                prev += `\n- ${key}: ${error}`;
                                return prev;
                            }, '');
                            error += fileErrors;
                        }
                        // Completely abort the process if this stage fails.
                        errors.push(error);
                    }
                    else {
                        // Failed at archive step.
                        errors.push(err.message);
                    }
                }
                else send({ type: 'fatal', error: `Unknown error: ${(err as Error).message}` });
            }
        }

    }
    catch(err: unknown) {
        if ((err as Error).message === 'User cancelled') {
            errors.push('Import process was cancelled by the user');
        }
        else {
            errors.push((err as Error).message);
            send({ type: 'fatal', error: 'Unexpected error: '+(err as Error)?.message });
        }
    }


    // try {
    //     await updateContentCatalogue(gameId, localAppData, successful, send);
    // }
    // catch(err) {
    //     errors.push(`Error removing imported mods from ContentCatalog.txt: ${(err as Error).message}`);
    // }

    send({ type: 'importcomplete', errors, total: modsToImport.length, successful: successful.length });
}

process.on('message', async (message) => {
    if (
        !message 
        || typeof message !== 'object' 
        || !('type' in message)
    ) return;
    const msg = message as ImportMessage;
    switch(msg.type) {
        case 'cancel': {
            cancelled = true;
            return;
        }
        case 'scan': {
            send({ type: 'message', level: 'info', message: `Scan props ${msg.gamePath} ${msg.steamAppId} ${Object.keys(msg).join(',')}` })
            await scan(msg.gamePath, msg.steamAppId);
            return;
        }
        case 'import': {
            await importMods(
                msg.importIds, msg.gamePath, msg.gameId, 
                msg.steamAppId, msg.stagingFolder, msg.downloadFolder, 
                msg.createArchives
            );
            return;
        }
        default: {
            send({ type: 'fatal', error: `Unknown message event: ${(msg as any)?.type}` });
            return;
        }
    }
});