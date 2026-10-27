import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Observable } from 'rxjs';
import { INotificationBannerInfo } from '../../models/notification-banner.models';
import { NotificationBannerService } from '../../services/notification-banner/notification-banner.service';

/**
 * Global notification banner component
 *
 * Displays notification messages at the top of the application with various severity levels.
 * Supports auto-dismiss functionality and manual dismissal.
 */
@Component({
  selector: 'app-notification-banner',
  templateUrl: './notification-banner.component.html',
  styleUrl: './notification-banner.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBannerComponent {
  public readonly notificationBannerInfo$: Observable<INotificationBannerInfo | null>;

  /**
   * Creates an instance of NotificationBannerComponent.
   */
  public constructor(private readonly notificationBannerService: NotificationBannerService) {
    this.notificationBannerInfo$ = this.notificationBannerService.bannerInfo$;
  }

  /**
   * Handle banner toggle event to close the banner when collapsed
   */
  public onBannerToggle(event: Event): void {
    const target = event.target as HTMLDetailsElement;

    if (!target.open) {
      this.notificationBannerService.closeBanner();
    }
  }
}
