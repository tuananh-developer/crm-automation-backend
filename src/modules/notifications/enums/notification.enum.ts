export enum NotificationType {
  /** Emitted by UC07 ReviewService when a review task is assigned. */
  HUMAN_REVIEW_REQUIRED = 'HUMAN_REVIEW_REQUIRED',
  /**
   * Reserved for UC06 Execute Follow-up: emitted when a follow-up execution
   * ends in FAILED. The follow-up service does not live on this branch yet, so
   * no row currently carries this type.
   */
  FOLLOW_UP_FAILED = 'FOLLOW_UP_FAILED',
}
