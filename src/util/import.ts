import * as I18next from 'i18next';
import Promise from 'bluebird';
import * as path from 'path';
import * as Redux from 'redux';
import { ISteamWorkshopEntry } from '../types/workshopEntries';

import { actions, selectors, types, log, util } from 'vortex-api';


function importMods(t: Function,
                    store: Redux.Store<types.IState>,
                    wsBasePath: string,
                    mods: ISteamWorkshopEntry[],
                    progress: (mod: string, idx: number) => void): Promise<string[]> {
    
    const gameId = selectors.activeGameId(store.getState());
    const errors: string[] = [];

    log('debug', 'Steam Workshop import starting');
    const installPath = selectors.installPath(store.getState());
    return Promise.mapSeries(mods, (mod, idx, len) => {
        log('debug', 'transferring', mod);
        const vortexId = `steam-${mod.publishedfileid}`;
        progress(mod.title, idx/len);
        return transferMod(mod, wsBasePath, installPath, vortexId)
            .then(() => Promise.resolve(''))
            .catch(err => {
                log('debug', 'Failed to import', err);
                errors.push(mod.title);
            })
                .then(() => {
                    store.dispatch(actions.addMod(gameId, toVortexMod(mod, vortexId)));
                    return Promise.resolve();
                })
    })
    .then(() => {
        log('debug', 'Finished importing');
        return errors;
    });

}

function transferMod(mod: ISteamWorkshopEntry, wsPath: string, installPath: string, vortexId: string): Promise<any> {
    const sourcePath = path.join(wsPath, mod.publishedfileid);
    const destinationPath = path.join(installPath, vortexId);

    return util.copyRecursive(sourcePath, destinationPath);
}

function toVortexMod(mod: ISteamWorkshopEntry, vortexId: string) : types.IMod {
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
            installTime: new Date(),
            version: '1.0.0',
            notes: 'Imported from Steam Workshop',
            steamWorkshopId: mod.publishedfileid
        }
    };
    return vortexMod;
}

export default importMods;