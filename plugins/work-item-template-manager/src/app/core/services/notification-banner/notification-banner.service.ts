import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { BannerSeverity } from '@ni/nimble-angular';
import {
  INotificationBannerAnchorInfo,
  INotificationBannerInfo,
} from '../../models/notification-banner.models';

/**
 * Service for managing global notification banners
 *
 * Provides methods to show error and information banners with optional anchor actions.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationBannerService {
  public readonly bannerInfo$: Observable<INotificationBannerInfo | null>;
  private readonly bannerInfoSubject = new BehaviorSubject<INotificationBannerInfo | null>(null);

  /** Creates an instance of NotificationBannerService. */
  public constructor() {
    this.bannerInfo$ = this.bannerInfoSubject.asObservable();
  }

  /**
   * Display an error notification banner
   */
  public showError(
    title: string,
    description: string,
    preventDismiss = false,
    anchor?: INotificationBannerAnchorInfo,
  ): void {
    this.bannerInfoSubject.next({
      title,
      description,
      severity: BannerSeverity.error,
      anchor,
      preventDismiss,
    });
  }

  /**
   * Display an information notification banner
   */
  public showInformation(
    title: string,
    description: string,
    preventDismiss = false,
    anchor?: INotificationBannerAnchorInfo,
  ): void {
    this.bannerInfoSubject.next({
      title,
      description,
      severity: BannerSeverity.information,
      anchor,
      preventDismiss,
    });
  }

  /**
   * Close the current notification banner
   */
  public closeBanner(): void {
    this.bannerInfoSubject.next(null);
  }
}
