// Compatibility entrypoint. The city no longer has an "infinite-only" building
// implementation: all structural fabric is owned by KowloonFabricEngine.
export {
    createKowloonFabricEngine,
    createKowloonFabricEngine as createInfiniteCityChunkFactory,
} from './kowloon-fabric-engine.js';
