// Add entries only after provider/creator permission and transport are verified.
// Keeping these empty makes the default pack fail closed.
export const MEDIA_ALLOWLISTS = Object.freeze({
    owncast: Object.freeze([]),
    publicAccess: Object.freeze([]),
    ambient: Object.freeze([]),
});
