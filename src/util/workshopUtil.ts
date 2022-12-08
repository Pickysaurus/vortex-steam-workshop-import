import { fs, types, log } from 'vortex-api';
import * as path from 'path';
import { Axios, AxiosError, AxiosResponse, AxiosRequestConfig } from 'axios';
import { ISteamWorkshopEntry } from '../types/workshopEntries';

const axiosConfig: AxiosRequestConfig = {
    baseURL: 'https://api.steampowered.com',
    headers: {
        'Content-Type' : 'application/x-www-form-urlencoded',
    },
    method: 'POST',
    timeout: 30000,
    transformResponse: (res) => JSON.parse(res)
};

export async function getWorkshopModData(workshopPath: string): Promise<ISteamWorkshopEntry[]> {
    try {
        const directory: string[] = await fs.readdirAsync(workshopPath);
        // Filter anything that isn't a numerical folder - this won't be a Workshop mod.
        const workshopIds = directory.filter(d => !path.extname(d) && d.match(/[0-9]+/));
        if (!workshopIds || !workshopIds.length) return [];
        const formData = new FormData()
        formData.append('itemcount', workshopIds.length.toString());
        // Add the IDs we want to the post data
        workshopIds.map((id: string, idx: number) => formData.append(`publishedfileids[${idx}]`, id.toString()));
        try {
            const ax = new Axios(axiosConfig);
            const query: AxiosResponse = await ax.post(`/ISteamRemoteStorage/GetPublishedFileDetails/v1/`, formData);
            if (!query.data?.response?.publishedfiledetails) {
                const err: any = new Error('The Steam API returned an invalid response. Check your vortex.log file for more details.');
                err.code = 'STEAMAPIERROR';
                log('error', 'Steam API response did not contain publishedfiledetails', { status: query.status, response: query.data?.response });
                throw err;
            }
            const mappedData = workshopIds.map(id => query.data?.response?.publishedfiledetails.find((file: ISteamWorkshopEntry) => file.publishedfileid === id));
            return mappedData;
            
        }
        catch(err) {
            // API or Network error
            if (err instanceof AxiosError || err.code === 'STEAMAPIERROR') {
                throw new AxiosError('An unexpected error occured when requested Workshop mod details from Steam', err.code);
            }
            // Else, unknown error.
            else throw new Error('An unknown error occurred: '+(err?.message || err));
        }
    }
    catch(err) {
        throw err;
    }
}

function findWorkshopPath(games: {[gameId: string]: types.IDiscoveryResult}, gameId: string, steamAppId: string) : Promise<string> {
    // If we don't have an app ID, we don't need to do anything else
    if (!steamAppId) return Promise.reject('NON_STEAM');
    // Get the full path of the game
    const gamePath: string = games[gameId].path;
    // If it doesn't include Steamapps, it's not a Steam game.
    if (gamePath.indexOf('steamapps') === -1) return Promise.reject('NON_STEAM');
    // Get the SteamApps folder
    const steamApps: string = gamePath.substr(0, gamePath.indexOf('steamapps') + 9);
    // Get the workshop folder for this game.
    const steamWorkshopFolder: string = path.join(steamApps, 'workshop', 'content', steamAppId.toString());
    // Check if the workshop DIR exists.
    return fs.readdirAsync(steamWorkshopFolder)
    .then((dirs) => {
        // The folder exists. 
        if (!dirs.length) return Promise.reject('NO_MODS');
        return Promise.resolve(steamWorkshopFolder);
    })
    .catch(err => {
        // The folder does not exist, or there was an error.
        return Promise.reject(err);
    });

}

export default findWorkshopPath;