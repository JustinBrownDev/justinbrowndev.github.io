// Compatibility entrypoint. Universal spawn/infinite detail now lives in the
// neutral KowloonFabricEnrichment module.
export {
    createKowloonFabricEnrichment,
    createKowloonFabricEnrichment as createInfiniteChunkEnrichment,
} from './kowloon-fabric-enrichment.js';
