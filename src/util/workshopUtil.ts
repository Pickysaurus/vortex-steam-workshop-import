import { fs, types, log } from 'vortex-api';
import * as path from 'path';
import * as https from 'https';
import { Axios, AxiosError, AxiosResponse, AxiosRequestConfig } from 'axios';
import { ISteamWorkshopEntry } from '../types/workshopEntries';
import { IncomingMessage } from 'http';
import * as querystring from 'querystring';

const steamRequestOptions = {
    hostname: 'api.steampowered.com',
    port: 443,
    path: '/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
    method: 'POST',
    headers: {
        'Content-Type' : 'application/x-www-form-urlencoded',
    },
};

const axiosConfig = (params: string): AxiosRequestConfig => ({
    url: '/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
    baseURL: 'api.steampowered.com',
    params,
    headers: {
        'Content-Type' : 'application/x-www-form-urlencoded',
        'Content-Size' : params.length
    },
    method: 'POST',
    timeout: 30000
});

export async function getWorkshopModData(workshopPath: string): Promise<ISteamWorkshopEntry[]> {
    try {
        const directory: string[] = await fs.readdirAsync(workshopPath);
        // Filter anything that isn't a numerical folder - this won't be a Workshop mod.
        const workshopIds = directory.filter(d => !path.extname(d) && d.match(/[0-9]+/));
        if (!workshopIds || !workshopIds.length) return [];
        const postData = { itemcount: workshopIds.length.toString() };
        // Add the IDs we want to the post data
        workshopIds.map((id: string, idx: number) => postData[`publishedfileids[${idx}]`] = id.toString());
        const postString: string = new URLSearchParams(Object.entries(postData)).toString();
        try {
            const ax = new Axios(axiosConfig(postString));
            const query: AxiosResponse = await ax.post('/ISteamRemoteStorage/GetPublishedFileDetails/v1/');
            if (!query.data?.publishedfiledetails) {
                const err: any = new Error('The Steam API returned an invalid response.');
                err.code = 'STEAMAPIERROR';
                log('error', 'Steam API response did not contain publishedfiledetails', { status: query.status, response: query.data });
                throw err;
            }
            const mappedData = workshopIds.map(id => query.data?.publishedfiledetails.find((file: ISteamWorkshopEntry) => file.publishedfileid === id));
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

export function getWorkshopModDataold(workshopPath: string): Promise<ISteamWorkshopEntry[]> {
    // Get a list of workshop IDs from the folder names.
    return fs.readdirAsync(workshopPath)
    .then(
        (workshopIds: Array<string>) => {
            if (!workshopIds || !workshopIds.length) return Promise.resolve([]);
            const dataObject = {'itemcount': workshopIds.length};
            workshopIds.map((id, idx) => dataObject[`publishedfileids[${idx}]`]=id);
            const data = querystring.stringify(dataObject);
            steamRequestOptions.headers['Content-size'] = data.length;

            return new Promise((resolve, reject) => {
                const req = https.request(steamRequestOptions, (res: IncomingMessage) => {
                    // console.log(`statuscode: ${res.statusCode}`);
                    let rawData = '';
                    res.on('data', d => rawData += d);
    
                    res.on('end', () => {
                        const reply = JSON.parse(rawData);
                        if (!reply.response?.publishedfiledetails) {
                            // Handle the Steam API not sending us back usable data. 
                            const err: any = new Error('The Steam API returned an invalid response, please report this error including your Vortex.log file.');
                            err.code = 'STEAMAPIERROR';
                            log('error', 'Steam API response did not contain publishedfiledetails', (reply.response || reply));
                            return reject(err);
                        }
                        const mappedData = workshopIds.map(id => reply.response.publishedfiledetails.find(file => file.publishedfileid === id));
                        return resolve(mappedData);
                    });
    
                });
    
                req.on('error', (error: Error) => reject(error));
    
                req.write(data);
                req.end();
            }).catch(err => Promise.reject(err));
        }
    )
    .catch(err => {
        Promise.reject(err);
    });
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