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
  time_created: number;
  time_updated: number;
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
  // new props
  files?: string[];
  api_data?: boolean;
  time_installed?: number;
}

interface ISteamTag {
  tag: string;
}

export interface ISteamGameInfoResponse {
  [steamAppId: string] : {
    success: boolean;
    data: {
      type: string;
      name: string;
      steam_appid: number;
      required_age:  string;
      is_free: boolean;
      dlc: number[];
      categories: { id: number, description: string }[];
      [key: string]: unknown;
    }
  }
}