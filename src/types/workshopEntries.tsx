export interface ISteamWorkshopEntry {
  publishedfileid: string;
  result: number;
  creator: string;
  creator_app_id: number;
  consumer_app_id: number;
  filename?: string;
  file_size?: number;
  file_url?: string;
  hcontent_file?: string;
  preview_url?: string;
  hcontent_preview?: string;
  title: string;
  description: string;
  time_created: Date;
  time_updated: Date;
  visibility?: number;
  banned?: number;
  ban_reason?: string;
  subscriptions?: number;
  favorited?: number;
  lifetime_subscriptions?: number;
  lifetime_favourited?: number;
  views?: number;
  tags?: Array<ISteamTag>;
  isAlreadyManaged: boolean;
}

interface ISteamTag {
  tag: string;
}

export interface IModEntry {
  nexusId: string;
  vortexId: string;
  downloadId: number;
  modName: string;
  archiveName: string;
  modVersion: string;
  importFlag: boolean;
  isAlreadyManaged: boolean;
  categoryId?: number;
}