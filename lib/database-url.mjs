/** Preserve pg 8's certificate-verifying behavior explicitly across upgrades.
 * @param {string} connectionString
 */
export function databaseURL(connectionString) {
  return connectionString.replace(
    /([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/g,
    "$1verify-full",
  );
}
