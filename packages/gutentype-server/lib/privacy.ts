/**
 * Every column the database holds, with the phrase on `/privacy` (`privacyCopy` in `@gutentype/content`) that names
 * it. ISC-64 diffs a schema dump against these keys and checks every phrase is on the page: a column added without
 * a line on the privacy page fails the check.
 */
export const storedFields: Readonly<Record<string, string>> = {
  // Keybr's account tables.
  "user.id": "your account",
  "user.email": "your account (email",
  "user.name": "a display name",
  "user.anonymized": "whether you chose to stay anonymous",
  "user.created_at": "the date you joined",
  "user_external_id.id": "if you use Google",
  "user_external_id.user_id": "if you use Google",
  "user_external_id.provider": "if you use Google",
  "user_external_id.external_id": "the Google account id",
  "user_external_id.name":
    "name, profile link and picture link Google sends us",
  "user_external_id.url": "profile link",
  "user_external_id.image_url": "picture link",
  "user_external_id.created_at": "if you use Google",
  "order.id": "(orders) exists but is always empty",
  "order.provider": "(orders) exists but is always empty",
  "order.user_id": "(orders) exists but is always empty",
  "order.name": "(orders) exists but is always empty",
  "order.email": "(orders) exists but is always empty",
  "order.created_at": "(orders) exists but is always empty",
  "user_login_request.id":
    "pending sign-in links (deleted after 15 minutes or on use)",
  "user_login_request.email":
    "pending sign-in links (deleted after 15 minutes or on use)",
  "user_login_request.access_token":
    "pending sign-in links (deleted after 15 minutes or on use)",
  "user_login_request.created_at":
    "pending sign-in links (deleted after 15 minutes or on use)",
  // Gutentype's tables.
  "gutentype_read_progress.user_id":
    "your reading progress per verse (speed and accuracy)",
  "gutentype_read_progress.pack":
    "your reading progress per verse (speed and accuracy)",
  "gutentype_read_progress.book":
    "your reading progress per verse (speed and accuracy)",
  "gutentype_read_progress.chapter":
    "your reading progress per verse (speed and accuracy)",
  "gutentype_read_progress.verse":
    "your reading progress per verse (speed and accuracy)",
  "gutentype_read_progress.speed":
    "your reading progress per verse (speed and accuracy)",
  "gutentype_read_progress.accuracy":
    "your reading progress per verse (speed and accuracy)",
  "gutentype_read_progress.ts":
    "your reading progress per verse (speed and accuracy)",
  "gutentype_counter.name": "We keep a daily total per counter",
  "gutentype_counter.day": "We keep a daily total per counter",
  "gutentype_counter.count": "We keep a daily total per counter",
  "gutentype_sign_in_attempt.email_hash": "a salted hash of the email address",
  "gutentype_sign_in_attempt.ip_hash": "of the network address for one hour",
  "gutentype_sign_in_attempt.created_at":
    "for one hour after each sign-in request",
};
