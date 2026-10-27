import { BannerSeverity } from '@ni/nimble-angular';

export interface INotificationBannerAnchorInfo {
  link: string;
  linkContent: string;
}

export interface INotificationBannerInfo {
  title: string;
  description: string;
  severity: BannerSeverity;
  preventDismiss: boolean;
  anchor?: INotificationBannerAnchorInfo;
}
