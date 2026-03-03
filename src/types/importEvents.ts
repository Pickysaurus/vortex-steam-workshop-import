import { ISteamWorkshopEntry } from "./workshopEntries";

export type ImportEvent<TMod = unknown, TLog = string> =
    | { type: 'fatal', error: string }
    | { type: 'exit', code: number }
    | { type: 'message', level: TLog, message: string, metadata?: any }
    // | { type: 'scanparsed', id: string, data: ISteamWorkshopEntry }
    | { type: 'scancomplete', total: number, errors: string[], mods: { [id: string]: ISteamWorkshopEntry } }
    | { type: 'importedmod', mod: TMod }
    | { type: 'importprogress', done: number, total: number, message: string, detail?: string }
    | { type: 'importcomplete', total: number, successful: number, errors: string[] }
    | { type: 'modremoved', id: number };
    

export type ImportMessage =
    | { type: 'cancel' }
    | { type: 'scan', gamePath: string, steamAppId: number }
    | { 
        type: 'import', importIds: string[], 
        gamePath: string, gameId: string, steamAppId: number, 
        stagingFolder: string, downloadFolder: string, 
        createArchives: boolean 
      }
    | { type: 'review', enabled: boolean }
    | { type: 'delete', gamePath: string, steamAppId: number };
      
