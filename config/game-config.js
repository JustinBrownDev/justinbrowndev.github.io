import { QP } from '../runtime/main-quantitative-literals.js';
import { CURATED_STREET_SIGN_PAIRS, CURATED_SYSTEM_SIGN_PAIRS, CURATED_ABOUT_PAIRS, CURATED_TUTORIAL_PAIRS } from '../content/curated/index.js';
import { CODE_LORE_PAIRS } from '../content/code-lore/index.js';

export const CONFIG = {

    targetPlatform: 'desktop',

     
     
     
     
    scene: {
        backgroundColor: 0x7ec4e8,
        fogColor: 0xcfe8f0,
        fogDensity: 0.018,
    },

     
     
     
    narrative: {
         
         
         
        lightWeb: {
            fogColor: 0xf0f4e0,
            fogDensity: 0.042,
            ambientColor: 0xfff4d0,
            ambientIntensity: 3.1,
            hemiIntensity: 1.0,
            signChance: 0.95,
            propDensityMul: 1.2,
        },
         
         
        darkWeb: {
            fogColor: 0xc8d8d8,
            fogDensity: 0.046,
            ambientColor: 0xd0e8e8,
            ambientIntensity: 2.5,
            hemiIntensity: 0.6,
            signChance: 0.85,
            propDensityMul: 0.85,
        },
    },

    camera: {
        fov: 78,
        near: 0.05,
        far: 380,
        eyeHeight: 1.65,
        playerRadius: 0.22,
    },

     
     
     
    streaming: {
        renderRadiusChunks: 2,
        prefetchRadiusChunks: 3,
        retentionRadiusChunks: 4,
        landmarkSpacingChunks: 3,
         
         
         
        urgentPumpChunks: 24,
        prefetchPumpChunks: 16,
        warmPumpChunks: 6,
        urgentBuildBudgetMs: 12,
        prefetchBuildBudgetMs: 8,
        warmBuildBudgetMs: 4,
        warmCooldownMs: 0,
         
         
         
        adornmentConcurrency: 4,
        chunkRefinementStepsDesktop: 4,
        chunkRefinementStepsWeak: 2,
    },

    lighting: {
        ambientColor: 0xd8d8c8,
        ambientIntensity: 1.8,
         
        moonColor: 0xfff8e0,
        moonIntensity: 1.2,
        moonPosition: { x: 20, y: 70, z: 10 },
         
        fillColor: 0xfff4d0,
        fillIntensity: 0.6,
        signLight: {
            intensity: 5,
            distance: 9,
            decay: 2,
        },
    },

     
     
     
     
     
     
    quality: {
         
         
         
         
         
         
         
         
         
        desktop: {
            maxPixelRatio: 2,
            antialias: true,
            bloom: { strength: 0.1, radius: 0.4, threshold: 0.88 },
            drawDistance: 50,
            maxDynamicLights: 10,
            propDensity: 1.5,
            maxEnterableFloors: 4,  
            maxHeroFloors: 10,  
        },
        mobile: {
            maxPixelRatio: 1.5,
            antialias: false,
            bloom: { strength: 0.1, radius: 0.35, threshold: 0.9 },
            drawDistance: 100,
            maxDynamicLights: 8,
            propDensity: 1.45,
            maxEnterableFloors: 3,
            maxHeroFloors: 6,
        },
         
         
         
         
        potato: {
            maxPixelRatio: 1,
            antialias: false,
            bloom: null,
            drawDistance: 100,
            maxDynamicLights: 5,
            propDensity: 0.2,
            maxEnterableFloors: 3,
            maxHeroFloors: 5,
        },
    },

     
     
     
     
    maze: {
         
         
         
         
         
         
         
         
         
         
         
         
        cols: 13,
        rows: 13,
         
         
         
         
         
         
         
         
         
         
        blockSize: 5,         
        streetWidth: 3,     
        loopChance: 0.50,    
        buildingMarginMin: 0.5,   
        buildingMarginMax: 1.4,
    },

    buildings: {
         
         
         
         
         
         
         
        floorCountWeights: { [QP[1]]: 10, [QP[2]]: 16, [QP[3]]: 10, [QP[4]]: 5, [QP[5]]: 4, [QP[6]]: 3, [QP[7]]: 2, [QP[8]]: 1, [QP[9]]: 0 },
         
         
        heroTowerChance: 0.08,
        heroFloorCountWeights: { [QP[10]]: 5, [QP[11]]: 5, [QP[12]]: 4, [QP[13]]: 3, [QP[14]]: 3, [QP[15]]: 2, [QP[16]]: 1, [QP[17]]: 1, [QP[18]]: 1 },
        roughness: 0.72,
         
         
        palette: [
            0xd8d4c4,  
            0xc8c2a8,  
            0xb8c8ac,  
            0xd8c488,  
            0xd89858,  
            0xc06858,  
            0xa8c8c8,  
            0xe8e4d4,  
            0xa0b890,  
            0xc4b494,  
        ],
        curb: {
            height: 0.12,
            overhang: 1.35,  
            color: 0xb8b0a0,
        },
    },

     
     
     
     
     
     
     
     
     
     
     
     
     
     
    signatureBuildings: {
        enabled: true,
        placement: {
             
             
             
             
             
            minDistanceCells: 1,
            preferredDistanceCells: 2,
             
             
             
            spawnRadiusCells: 5,
            requireStreetEntrance: true,  
            requireSecondaryConnection: true,  
            maxSeedAttempts: 500,  
        },
         
         
         
         
        artGallery: {
            enabled: true, targetCells: [1, 3], preferredFloors: 2, spawnOffsetCells: [-2, -2],
            exteriorName: 'no food or drink allowed', exteriorSubtitle: 'Art Gallery',
        },
        as400Archive: {
            enabled: true, targetCells: [1, 3], preferredFloors: 3, spawnOffsetCells: [2, -2],
            exteriorName: '*ARCHVE', exteriorSubtitle: 'IBM.MDRNGCPU(REFLIB)',
        },
        justinIndex: {
            enabled: true, targetCells: [1, 3], preferredFloors: 3, spawnOffsetCells: [-3, 2],
            exteriorName: 'Records', exteriorSubtitle: 'Dept. of',
        },
        systemsWorkshop: {
            enabled: true, targetCells: [1, 3], preferredFloors: 1, spawnOffsetCells: [3, 2],
            exteriorName: 'WORKSHOP', exteriorSubtitle: 'parts · repair · fabrication',
        },
        loreShrine: {
            enabled: true, targetCells: [1, 3], preferredFloors: 2, spawnOffsetCells: [0, 4],
            exteriorName: 'Museum', exteriorSubtitle: 'of caliper history',
             
             
            buttonLabels: ['TIME', 'POWER', 'START', 'STOP'],
        },
        futurePlaceholder: {
            enabled: true, targetCells: [2, 4], preferredFloors: 1, spawnOffsetCells: [0, -4],
            exteriorName: 'RESERVED', exteriorSubtitle: 'future singular area',
        },
    },

     
     
     
     
     
     
     
    neonPalette: [
        0xffffff,  
        0xd8d8d8,  
        0x808080,  
        0x1a1a1a,  
        0xfff02f,  
        0xffd93f,  
        0xc8a028,  
        0x3aff6a,  
        0x5eff8a,  
        0x1a5c2e,  
        0x2fe8ff,  
        0x5ff0ff,  
        0x1a7a8a,  
        0x2f6aff,  
        0x1a3a8a,  
        0xa02fff,  
        0x6a1a8a,  
        0xd82fff,  
        0xff2fd6,  
        0xff8ac0,  
        0xff8a2f,  
        0xffa64d,  
        0x8a4a1a,  
        0xff3b3b,  
        0xff5555,  
        0x8a1a1a,  
    ],
     
     
    neonWarm: [0xffffff, 0xfff02f, 0xffd93f, 0xc8a028, 0xff8a2f, 0xffa64d, 0x8a4a1a, 0xff3b3b, 0xff5555, 0x8a1a1a, 0xd82fff, 0xff2fd6, 0xff8ac0],
    neonCool: [0xffffff, 0xd8d8d8, 0x808080, 0x1a1a1a, 0x3aff6a, 0x5eff8a, 0x1a5c2e, 0x2fe8ff, 0x5ff0ff, 0x1a7a8a, 0x2f6aff, 0x1a3a8a, 0xa02fff, 0x6a1a8a],

     
     
     
     
     
    realData: {
         
         
         
         
         
        djiaMilestones: [
            [1950, 235.41], [1951, 269.23], [1952, 291.90], [1953, 280.90],
            [1954, 404.39], [1955, 488.40], [1956, 499.47], [1957, 435.69],
            [1958, 583.65], [1959, 679.36], [1960, 615.89], [1961, 731.14],
            [1962, 652.10], [1963, 762.95], [1964, 874.13], [1965, 969.26],
            [1966, 785.69], [1967, 905.11], [1968, 943.75], [1969, 800.36],
            [1970, 838.92], [1971, 890.20], [1972, 1020.02], [1973, 850.86],
            [1974, 616.24], [1975, 852.41], [1976, 1004.65], [1977, 831.17],
            [1978, 805.01], [1979, 838.74], [1980, 963.99], [1981, 875.00],
            [1982, 1046.54], [1983, 1258.64], [1984, 1211.57], [1985, 1546.67],
            [1986, 1895.95], [1987, 1938.83], [1988, 2168.57], [1989, 2753.20],
            [1990, 2633.66], [1991, 3168.83], [1992, 3301.11], [1993, 3754.09],
            [1994, 3834.44], [1995, 5117.12], [1996, 6448.27], [1997, 7908.25],
            [1998, 9181.43], [1999, 11497.12], [2000, 10786.85], [2001, 10021.50],
            [2002, 8341.63], [2003, 10453.92], [2004, 10783.01], [2005, 10717.50],
            [2006, 12463.15], [2007, 13264.82], [2008, 8776.39], [2009, 10428.05],
            [2010, 11577.51], [2011, 12217.56], [2012, 13104.14], [2013, 16576.66],
            [2014, 17823.07], [2015, 17425.03], [2016, 19762.60], [2017, 24719.22],
            [2018, 23327.46], [2019, 28538.44], [2020, 30606.48], [2021, 36338.30],
            [2022, 33147.25], [2023, 37689.54], [2024, 42544.22], [2025, 48063.29],
        ],
         
         
         
         
         
         
         
         
         
        elevationsFt: [
            ['Mariana Trench (Challenger Deep)', -35876],
            ['Death Valley', -282],
            ['Illinois: Mississippi/Ohio confluence (low pt)', 279],
            ['PCT: Bridge of the Gods', 200], ['PCT: Wind River', 940],
            ['PCT: Panther Creek Rd', 930], ['PCT: Crest Horse Camp', 3490],
            ['PCT: Junction Lake', 4730], ['PCT: Road 23', 3855],
            ['PCT: Kellen Creek Trail', 6084], ['PCT: Sheep Lake', 5760],
            ['PCT: White Pass / Hwy 12', 4405], ['PCT: Chinook Pass / Hwy 410', 5432],
            ['PCT: Big Crow Basin', 6290], ['PCT: Stampede Pass', 3680],
            ['PCT: Cathedral Pass', 5610], ['PCT: Stevens Pass / Hwy 2', 4060],
            ['PCT: Sitcum Creek', 3852], ['PCT: Rainy Pass / Hwy 20', 4855],
            ['PCT: Hart\'s Pass', 6198], ['PCT: Windy Pass', 6257],
            ['PCT: Mountain Camp', 6800], ['PCT: Canadian border', 4240],
            ['Illinois: mean elevation', 590],
            ['Illinois: Charles Mound (high pt)', 1235],
            ['Mount St. Helens, post-1980 eruption', 8363],
            ['Mount St. Helens, pre-1980 eruption', 9677],
            ['Denali', 20310],
            ['K2', 28251],
            ['Mount Everest', 29032],
        ],
         
         
         
         
         
        route66Illinois: [
            [0.0, 'CHICAGO'], [39.0, 'JOLIET'], [68.0, 'WILMINGTON'],
            [78.0, 'BRAIDWOOD'], [104.0, 'GARDNER'], [111.0, 'DWIGHT'],
            [139.0, 'PONTIAC'], [142.0, 'CHENOA'], [150.0, 'LEXINGTON'],
            [163.0, 'NORMAL'], [168.5, 'BLOOMINGTON'], [190.0, 'ATLANTA'],
            [204.0, 'LINCOLN'], [227.0, 'SHERMAN'], [254.0, 'DIVERNON'],
            [281.0, 'LITCHFIELD'], [291.0, 'MT. OLIVE'], [297.0, 'STAUNTON'],
            [315.0, 'EDWARDSVILLE'], [330.0, 'CHAIN OF ROCKS BRIDGE'],
            [335.0, 'MISSISSIPPI RIVER'],
        ],
    },

    billboards: {
         
         
         
        tutorial: CURATED_TUTORIAL_PAIRS.map(([title, subtitle]) => ({ title, subtitle })),
        navPages: [
            { title: 'PROJECTS', subtitle: 'selected work' },
            { title: 'ABOUT', subtitle: 'who\'s behind this' },
            { title: 'BLOG', subtitle: 'notes & writeups' },
            { title: 'CONTACT', subtitle: 'say hello' },
            { title: 'RESUME', subtitle: 'paper trail' },
            { title: 'LAB', subtitle: 'experiments' },
        ],
         
        flavorWords: [
            ...CURATED_STREET_SIGN_PAIRS,
            ['RAMEN', 'hot bowl'], ['SUSHI', 'fresh cut'], ['SOBA', 'noodle bar'],
            ['GYOZA', 'pan fried'], ['SAKE', 'warm cup'], ['IZAKAYA', 'open late'],
            ['KARAOKE', 'private room'], ['PACHINKO', '24 hrs'], ['ARCADE', 'coin op'],
            ['HOSTESS', 'no cover'], ['LOUNGE', 'members'], ['CLUB NEON', 'tonight'],
            ['TATTOO', 'walk-ins'], ['SAUNA', 'open 24h'], ['LOVE HTL', 'by hour'],
            ['NOODLES', 'cheap eats'], ['CIGARETTES', 'vending'], ['PAWN', 'cash now'],
            ['FORTUNE', 'palm read'], ['BAR', 'no name'], ['MARKET', 'night stalls'],
            ['VIDEO', 'rental'], ['CURRY', 'house special'], ['GACHA', '¥200'],
            ['HARDWARE', 'keys cut'], ['TAILOR', 'same day'], ['LOCKSMITH', '24hr'],
            ['BIKE REPAIR', 'walk-in'], ['PRINT SHOP', 'copies · fax'], ['HERBALIST', 'loose leaf'],
            ['BAKERY', 'fresh 6am'], ['WATCH REPAIR', 'while you wait'], ['USED BOOKS', 'buy sell trade'],
            ['DRY CLEAN', 'next day'], ['BARBER', 'no appt'], ['HOBBY SHOP', 'model kits'],
            ['PAWN & LOAN', 'gold · guns · gear'], ['24HR DINER', 'always open'], ['CHECK CASHING', 'no ID needed'],
            ['SMOKE SHOP', 'papers · lighters'], ['NAIL SALON', 'walk-ins ok'], ['PHONE REPAIR', 'screens fixed'],
            ['KEY CUTTING', 'while you wait'], ['PSYCHIC READINGS', 'first one free'], ['USED ELECTRONICS', 'cash paid'],
             
             
             
             
            ...(() => {
                const nouns = [
                    'RAMEN STAND', 'UDON HOUSE', 'DUMPLING BAR', 'TEA HOUSE', 'VINYL SHOP',
                    'CAMERA REPAIR', 'CAPSULE HOTEL', 'INTERNET CAFE', 'BATHHOUSE', 'FLORIST',
                    'STATIONERY', 'ANTIQUES', 'RECORD SHOP', 'COMIC SHOP', 'THRIFT STORE',
                    'JEWELRY', 'SHOE REPAIR', 'UMBRELLA REPAIR', 'FISH MARKET', 'BUTCHER',
                    'GREENGROCER', 'YAKITORI', 'TEMPURA', 'SOBA HOUSE', 'CRAFT BEER',
                    'WINE BAR', 'COFFEE STAND', 'LAUNDROMAT', 'SHRINE GOODS', 'INCENSE SHOP',
                    'KNIFE SHOP', 'RAMEN 2ND FLOOR', 'NOODLE CART', 'CIGAR LOUNGE', 'VAPE SHOP',
                ];
                const tags = [
                    'open late', 'cash only', 'no photos', 'members only', 'ask inside',
                    'closed mondays', '24 hrs', 'walk-ins welcome', 'family owned', 'since forever',
                    'back alley only', 'ring twice', 'basement level', 'second floor', 'no english menu',
                ];
                const out = [];
                for (const n of nouns) for (const t of tags) out.push([n, t]);
                return out;
            })(),
        ],
         
         
         
         
         
         
         
        decoyIdentities: [
            ['J. BROWN', 'orthodontist · OH'], ['JUSTIN BROWN', 'youth soccer, U12'],
            ['J BROWN', 'in memoriam 1958–2011'], ['JUSTINBROWN99', 'last seen 2013'],
            ['J BROWN LLC', 'entity dissolved'], ['JUSTIN R. BROWN', 'unclaimed property'],
            ['@justinbrown', 'account suspended'], ['J. BROWN', '214 county matches'],
            ['JUSTIN BROWN', 'this is not him'], ['J. BROWN', 'no relation'],
            ['JUSTIN BROWN', 'real estate, TX'], ['J BROWN', 'obituary, 1972'],
            ['JUSTIN BROWN', 'band, defunct'], ['J. BROWN', 'wrong number'],
            ['JUSTIN BROWN', 'see also: 3,529 others'],
        ],
         
         
        codeLore: CODE_LORE_PAIRS,
        systemNoise: [
            ...CURATED_SYSTEM_SIGN_PAIRS,
            ['NO RESULTS', 'refine your query'], ['0 OF 3,529', 'estimated matches'],
            ['404', 'identity not found'], ['ACCESS DENIED', 'insufficient signal'],
            ['CACHED', '3 years stale'], ['RATE LIMITED', 'try again later'],
            ['DELETED', 'profile unavailable'], ['AMBIGUOUS', 'too common a name'],
            ['LOADING', '...'], ['PAYWALL', 'subscribe to continue'],
            ['UNVERIFIED', 'take with salt'], ['INDEXING', 'come back later'],
             
            ...(() => {
                const statuses = [
                    'TIMEOUT', 'STALE CACHE', 'PARTIAL MATCH', 'QUERY TOO BROAD', 'SESSION EXPIRED',
                    'CAPTCHA REQUIRED', 'THROTTLED', 'MIRROR UNAVAILABLE', 'ARCHIVE ONLY', 'REDACTED',
                    'SYNONYM EXPANDED', 'SPELL-CHECKED', 'RESULTS HIDDEN', 'REGION LOCKED', 'LOGIN REQUIRED',
                    'BOT TRAFFIC DETECTED', 'CRAWLER BLOCKED', 'FLAGGED', 'INDEX REBUILDING', 'FORWARDING',
                ];
                const subs = [
                    'try narrowing your search', 'insufficient signal', 'servers under load',
                    'see terms of service', 'automated response', 'no further information',
                    'check spelling', 'try again later', 'escalated, no ETA', 'ask a human instead',
                ];
                const out = [];
                for (const s of statuses) for (const sub of subs) out.push([s, sub]);
                return out;
            })(),
        ],
         
         
        signal: { title: 'J. BROWN', subtitle: 'verified · you found it', color: 0xffffff },
         
         
        tabloidHeadlines: [
            ['3,529 JUSTIN BROWNS FOUND', 'none of them him — full report pg. 6'],
            ['LOCAL MAN STILL UNGOOGLABLE', 'experts baffled, ask him for help anyway'],
            ['SEARCH ENGINE ADMITS DEFEAT', '"we have too many results," says spokesbot'],
            ['NAME TOO COMMON, CLAIMS STUDY', 'try a middle initial, scientists suggest'],
            ['PUBLIC SECRET CONFIRMED REAL', 'hidden in plain sight since birth'],
        ],
         
         
         
         
        nearMissSignals: [
            { title: 'J. BROWN', subtitle: 'unverified — keep looking', color: 0xd8ded8 },
            { title: 'J. BROWN', subtitle: 'listing expired', color: 0xffd93f },
        ],
         
         
        contentWeights: { nav: 3, decoy: 6, noise: 3, code: 1.25, flavor: 5, data: 18 },
    },

     
     
     
     
    siteContent: {
        skills: [
            ['PYTHON', 'daily driver'], ['WEB DEV', 'html/css/js'],
            ['LEADERSHIP', 'ACM president'], ['C / C# / C++', 'systems'],
            ['EMBEDDED', 'bare metal'], ['LINUX', 'no distro war'],
        ],
        education: [
            ['SIU CARBONDALE', 'B.S. comp sci · 2023-now'],
            ['ACM PRESIDENT', 'assoc. of computing machinery'],
            ['COLLEGE OF DUPAGE', '2019-2023'],
            ['COURSEWORK', 'ML · cybersecurity · SWE'],
        ],
        employment: [
            ['DATAANNOTATION', 'AI trainer · 2024-now'],
            ["HORTON'S LIGHTING", 'warehouse · 2021-23'],
            ['LA GRANGE THEATER', 'projectionist · 2018-20'],
            ['ACE HARDWARE', 'former job'],
            ['DRY CLEANERS', 'former job'],
        ],
        art: [
            ["'TEETH'", 'acrylic on canvas'],
            ['SELF PORTRAIT', 'acrylic on canvas'],
            ["'GARY FISCHER'", 'india ink on paper'],
            ["'THE FISH'", 'linoleum print'],
            ['ORGANIC TV', 'cast iron · lost wax'],
            ['PUPPET HEAD', 'wire & tissue paper'],
        ],
         
        codeProjects: [
            ['TRAFFIC BLASTER', 'python · openvpn, 2024'],
            ['SLIDING TILES', 'python solver, 2023'],
            ['SPINNING CUBE', 'c++ terminal 3d, 2022'],
            ['BIBITINATOR', 'c# save editor, 2021'],
            ['MC COMPUTER', 'copper bulb logic, 2025'],
            ['CYBERDECK', 'raspberry pi rig, 2024'],
            ['EMP GENERATOR', 'grill lighter build, 2024'],
        ],
         
        webProjects: [
            ['VITALSAGE', 'wordpress build, 2024'],
            ['BRANDYOUPROMO', 'asp.net site, 2022'],
        ],
         
        about: [
            ...CURATED_ABOUT_PAIRS,
            ['TAKE IT APART', 'to see how it works'],
            ['ALWAYS LEARNING', 'next skill, next problem'],
            ['UNBOUND', 'not afraid of the machine'],
            ['THEY ASK ME', "for the advice"],
            ['PUBLIC SECRET', 'hidden by numbers, not by hiding'],
        ],
         
         
         
         
        lifePhotos: [
            ['GRADUATION', 'SIU Carbondale'],
            ['FOUNDRY DAY', 'iron casting'],
            ['SERVER RACK', 'cable management, in progress'],
            ['DISK ARRAY', 'reclaimed hardware'],
            ['MIRROR, 2AM', 'a photo, for once'],
        ],
         
         
        contact: [
            ['JUSTIN BROWN', 'justin@jweb.dev'],
            ['J. BROWN', '(630) 880-7886'],
            ['JWEB.DEV', 'expired business card'],
        ],
    },

    props: {
         
         
        weights: {
            trashCan: 4,
            trafficCone: 3,
            trafficSign: 2,
            trafficSignal: 0.8,  
            mileMarker: 2,
            wantedPoster: 5,  
            crate: 4,
            lantern: 4,
            vendingMachine: 2.5,
            fenceSegment: 1.5,
            museumPlacard: 2.5,
            stickerTag: 3.5,
            businessCardLitter: 2,
            manhole: 2,
            pigeon: 2.5,
            fissureCrack: 1.5,
            tree: 1.5,
            pottedPlant: 3,
            weeds: 3.5,
            none: 0.03,  
        },
         
         
         
         
         
         
         
         
         
         
         
        maxSpecialFeatures: {
            statues: 4,
            constructionZones: 4,
            crimeScenes: 2,
            newsstands: 3,
            phoneBooths: 3,
            atmKiosks: 3,
            parks: 4,
            megaBillboards: 3,
        },
    },

     
     
     
     
     
    streets: {
        gridSpacing: 4,
        propDensityMul: 0.5,  
    },

    movement: {
        speed: 4.5,  
        sprintMultiplier: 1.7,  
        maxDeltaSeconds: 0.1,
    },

    desktopControls: {
        pointerSpeed: 3.2,  
    },

    touchControls: {
        joystickRadius: 50,
        lookSensitivity: 0.0035,
        pitchLimit: Math.PI / 2 - 0.05,
    },
};
