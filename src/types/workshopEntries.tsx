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
  time_created: Date | string;
  time_updated: Date | string;
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
}

interface ISteamTag {
  tag: string;
}