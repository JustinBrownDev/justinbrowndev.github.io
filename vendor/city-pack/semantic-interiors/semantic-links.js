// Representative semantic-link overlay from jweb-semantic-megacorpus-v4.
// The bulk corpus stays external for now; this file proves the runtime contract
// without creating a second asset catalog or a second placement system.

export const SEMANTIC_LINK_OVERRIDES = Object.freeze({
  "semantic/interior/office_desk": {
    "semanticGraph": {
      "schema": "jweb.semantic-links.v1",
      "roles": [
        "semantic-prop"
      ],
      "capabilities": [
        "support-surface-provider"
      ],
      "requirements": [],
      "relationships": [],
      "reservedVolumes": [],
      "support": {
        "mode": "floor",
        "required": true
      },
      "circulation": {
        "keepClear": [],
        "aisleBias": null
      },
      "edgeBehavior": [],
      "storySemantics": {
        "storyAligned": false,
        "landingRoles": []
      },
      "progressiveInvariant": {
        "geometryMayRefine": true,
        "topologyMayChange": false,
        "reservedSpaceMayChange": false,
        "collisionAuthority": "world"
      },
      "negativeSpace": false
    },
    "linkTags": [
      "semantic-prop",
      "support-surface-provider"
    ],
    "metadataVersion": 4
  },
  "semantic/interior/crt_monitor": {
    "semanticGraph": {
      "schema": "jweb.semantic-links.v1",
      "roles": [
        "semantic-prop"
      ],
      "capabilities": [],
      "requirements": [
        "support-surface"
      ],
      "relationships": [
        "sits-on-work-surface"
      ],
      "reservedVolumes": [],
      "support": {
        "mode": "floor",
        "required": true
      },
      "circulation": {
        "keepClear": [],
        "aisleBias": null
      },
      "edgeBehavior": [],
      "storySemantics": {
        "storyAligned": false,
        "landingRoles": []
      },
      "progressiveInvariant": {
        "geometryMayRefine": true,
        "topologyMayChange": false,
        "reservedSpaceMayChange": false,
        "collisionAuthority": "world"
      },
      "negativeSpace": false
    },
    "linkTags": [
      "semantic-prop",
      "sits-on-work-surface",
      "support-surface"
    ],
    "metadataVersion": 4
  },
  "semantic/interior/server_rack": {
    "semanticGraph": {
      "schema": "jweb.semantic-links.v1",
      "roles": [
        "semantic-prop"
      ],
      "capabilities": [
        "support-surface-provider"
      ],
      "requirements": [
        "service-clearance"
      ],
      "relationships": [
        "display-or-storage-provider",
        "row-alignable",
        "utility-zone-compatible",
        "wall-anchored"
      ],
      "reservedVolumes": [],
      "support": {
        "mode": "wall",
        "required": true
      },
      "circulation": {
        "keepClear": [
          {
            "side": "front",
            "depth": 0.6
          }
        ],
        "aisleBias": null
      },
      "edgeBehavior": [],
      "storySemantics": {
        "storyAligned": false,
        "landingRoles": []
      },
      "progressiveInvariant": {
        "geometryMayRefine": true,
        "topologyMayChange": false,
        "reservedSpaceMayChange": false,
        "collisionAuthority": "world"
      },
      "negativeSpace": false
    },
    "linkTags": [
      "display-or-storage-provider",
      "row-alignable",
      "semantic-prop",
      "service-clearance",
      "support-surface-provider",
      "utility-zone-compatible",
      "wall-anchored"
    ],
    "metadataVersion": 4
  },
  "semantic/interior/mainframe_cabinet": {
    "semanticGraph": {
      "schema": "jweb.semantic-links.v1",
      "roles": [
        "semantic-prop"
      ],
      "capabilities": [
        "support-surface-provider"
      ],
      "requirements": [
        "service-clearance"
      ],
      "relationships": [
        "row-alignable",
        "utility-zone-compatible",
        "wall-anchored"
      ],
      "reservedVolumes": [],
      "support": {
        "mode": "wall",
        "required": true
      },
      "circulation": {
        "keepClear": [
          {
            "side": "front",
            "depth": 0.6
          }
        ],
        "aisleBias": null
      },
      "edgeBehavior": [],
      "storySemantics": {
        "storyAligned": false,
        "landingRoles": []
      },
      "progressiveInvariant": {
        "geometryMayRefine": true,
        "topologyMayChange": false,
        "reservedSpaceMayChange": false,
        "collisionAuthority": "world"
      },
      "negativeSpace": false
    },
    "linkTags": [
      "row-alignable",
      "semantic-prop",
      "service-clearance",
      "support-surface-provider",
      "utility-zone-compatible",
      "wall-anchored"
    ],
    "metadataVersion": 4
  },
  "semantic/interior/parts_bin_rack": {
    "semanticGraph": {
      "schema": "jweb.semantic-links.v1",
      "roles": [
        "semantic-prop"
      ],
      "capabilities": [
        "support-surface-provider"
      ],
      "requirements": [],
      "relationships": [
        "display-or-storage-provider",
        "row-alignable",
        "wall-anchored"
      ],
      "reservedVolumes": [],
      "support": {
        "mode": "wall",
        "required": true
      },
      "circulation": {
        "keepClear": [],
        "aisleBias": null
      },
      "edgeBehavior": [],
      "storySemantics": {
        "storyAligned": false,
        "landingRoles": []
      },
      "progressiveInvariant": {
        "geometryMayRefine": true,
        "topologyMayChange": false,
        "reservedSpaceMayChange": false,
        "collisionAuthority": "world"
      },
      "negativeSpace": false
    },
    "linkTags": [
      "display-or-storage-provider",
      "row-alignable",
      "semantic-prop",
      "support-surface-provider",
      "wall-anchored"
    ],
    "metadataVersion": 4
  },
  "semantic/interior/filing_cabinet": {
    "semanticGraph": {
      "schema": "jweb.semantic-links.v1",
      "roles": [
        "semantic-prop"
      ],
      "capabilities": [
        "support-surface-provider"
      ],
      "requirements": [],
      "relationships": [
        "row-alignable",
        "wall-anchored"
      ],
      "reservedVolumes": [],
      "support": {
        "mode": "wall",
        "required": true
      },
      "circulation": {
        "keepClear": [],
        "aisleBias": null
      },
      "edgeBehavior": [],
      "storySemantics": {
        "storyAligned": false,
        "landingRoles": []
      },
      "progressiveInvariant": {
        "geometryMayRefine": true,
        "topologyMayChange": false,
        "reservedSpaceMayChange": false,
        "collisionAuthority": "world"
      },
      "negativeSpace": false
    },
    "linkTags": [
      "row-alignable",
      "semantic-prop",
      "support-surface-provider",
      "wall-anchored"
    ],
    "metadataVersion": 4
  },
  "semantic/interior/library_stack_bay": {
    "semanticGraph": {
      "schema": "jweb.semantic-links.v1",
      "roles": [
        "semantic-prop"
      ],
      "capabilities": [],
      "requirements": [],
      "relationships": [
        "row-alignable"
      ],
      "reservedVolumes": [],
      "support": {
        "mode": "floor",
        "required": true
      },
      "circulation": {
        "keepClear": [],
        "aisleBias": null
      },
      "edgeBehavior": [],
      "storySemantics": {
        "storyAligned": false,
        "landingRoles": []
      },
      "progressiveInvariant": {
        "geometryMayRefine": true,
        "topologyMayChange": false,
        "reservedSpaceMayChange": false,
        "collisionAuthority": "world"
      },
      "negativeSpace": false
    },
    "linkTags": [
      "row-alignable",
      "semantic-prop"
    ],
    "metadataVersion": 4
  },
  "semantic/interior/tool_cabinet": {
    "semanticGraph": {
      "schema": "jweb.semantic-links.v1",
      "roles": [
        "semantic-prop"
      ],
      "capabilities": [
        "support-surface-provider"
      ],
      "requirements": [],
      "relationships": [
        "row-alignable",
        "wall-anchored"
      ],
      "reservedVolumes": [],
      "support": {
        "mode": "wall",
        "required": true
      },
      "circulation": {
        "keepClear": [],
        "aisleBias": null
      },
      "edgeBehavior": [],
      "storySemantics": {
        "storyAligned": false,
        "landingRoles": []
      },
      "progressiveInvariant": {
        "geometryMayRefine": true,
        "topologyMayChange": false,
        "reservedSpaceMayChange": false,
        "collisionAuthority": "world"
      },
      "negativeSpace": false
    },
    "linkTags": [
      "row-alignable",
      "semantic-prop",
      "support-surface-provider",
      "wall-anchored"
    ],
    "metadataVersion": 4
  }
});

export const SEMANTIC_RELATIONSHIP_SAMPLES = Object.freeze({
  office: Object.freeze([
    Object.freeze({ phase: 'identity', assetId: 'semantic/interior/office_desk' }),
    Object.freeze({ phase: 'functional', assetId: 'semantic/interior/crt_monitor' }),
  ]),
  '1980s_office': Object.freeze([
    Object.freeze({ phase: 'identity', assetId: 'semantic/interior/office_desk' }),
    Object.freeze({ phase: 'functional', assetId: 'semantic/interior/crt_monitor' }),
  ]),
  server_room: Object.freeze([
    Object.freeze({ phase: 'identity', assetId: 'semantic/interior/server_rack' }),
    Object.freeze({ phase: 'functional', assetId: 'semantic/interior/mainframe_cabinet' }),
  ]),
  mainframe_room: Object.freeze([
    Object.freeze({ phase: 'identity', assetId: 'semantic/interior/mainframe_cabinet' }),
    Object.freeze({ phase: 'functional', assetId: 'semantic/interior/server_rack' }),
  ]),
});

export function semanticGraphForAsset(def) {
    if (!def?.id) return def?.semanticGraph ?? null;
    return SEMANTIC_LINK_OVERRIDES[def.id]?.semanticGraph ?? def.semanticGraph ?? null;
}
