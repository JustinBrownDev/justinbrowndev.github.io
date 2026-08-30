import * as THREE from '../vendor/three/three.module.js';
import { QP } from '../runtime/main-quantitative-literals.js';
import { SpatialHash2D } from '../city-performance.js';
import { JUNK_BASE_KINDS, JUNK_WEAR_STATES, JUNK_SIZE_CLASSES } from '../content/junk-content.js';
import { outwardRotationY } from '../systems/cardinal.js';

export function createStreetPropsSystem(deps) {
    const {
        CELL, CONFIG, STATIC_BATCH_CHUNK, grid, scene, unitPlaneGeo, takeDynamicLight,
        getStaticWorldOptimizer, registerAnimatedMaterial, getPoetryShort, getPoetryMedium, getPickPoetryTag,
        addFissureCrack, addWantedPoster, hexToCss, jitterGeometry, laneOffset, makePixelTexture,
        pick, pickCityNoisePair, pickInkColor, pickNetworkNoise, pickPaperColor,
        pickRandomizedCuratedPair, pickRandomizedLorePair, pickTextFont, placeRealModel,
        randRange, rng, unseededPick
    } = deps;


    function propCandidatesNear(x, z, queryRadius) {
        return propColliderIndex.queryRadius(x, z, queryRadius + maxPropColliderRadius + QP[4721], _propOverlapCandidates);
    }

    const _colliderBox = new THREE.Box3();
    const _colliderSize = new THREE.Vector3();
    function colliderRadiusFromObject(obj) {
        _colliderBox.setFromObject(obj);
        _colliderBox.getSize(_colliderSize);
        return Math.max(_colliderSize.x, _colliderSize.z) / QP[3261];
    }

    function addTrashCan(x, z) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3262], QP[3263], QP[3264], QP[3265]), QP[3266]),
            new THREE.MeshStandardMaterial({ color: QP[3267], roughness: QP[3268], metalness: QP[3269] })
        );
        body.position.y = QP[3270];
        const lid = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3271], QP[3272], QP[3273], QP[3274]), QP[3275]),
            new THREE.MeshStandardMaterial({ color: QP[3276], roughness: QP[3277], metalness: QP[3278] })
        );
        lid.position.y = QP[3279];
        g.add(body, lid);
        g.position.set(x, QP[3280], z);
        scene.add(g);
        return colliderRadiusFromObject(g);
    }

    function addTrafficCone(x, z) {
        const g = new THREE.Group();
        const cone = new THREE.Mesh(
            jitterGeometry(new THREE.ConeGeometry(QP[3281], QP[3282], QP[3283]), QP[3284]),
            new THREE.MeshStandardMaterial({ color: QP[3285], roughness: QP[3286] })
        );
        cone.position.y = QP[3287];
        const stripe = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3288], QP[3289], QP[3290], QP[3291]), QP[3292]),
            new THREE.MeshStandardMaterial({ color: QP[3293], roughness: QP[3294] })
        );
        stripe.position.y = QP[3295];
        g.add(cone, stripe);
        g.position.set(x, QP[3296], z);
        scene.add(g);
        return QP[3297];
    }

     
     
     
    function addMileMarker(x, z, rotY) {
        const [mile, town] = pick(CONFIG.realData.route66Illinois);
        const pole = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3298], QP[3299], QP[3300], QP[3301]), QP[3302]),
            new THREE.MeshStandardMaterial({ color: QP[3303], roughness: QP[3304], metalness: QP[3305] })
        );
        pole.position.y = QP[3306];
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#0a3a1c';
            ctx.fillRect(QP[3307], QP[3308], w, h);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = QP[3309];
            ctx.strokeRect(QP[3310], QP[3311], w - QP[3312], h - QP[3313]);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.font = 'bold 8px "Courier New", monospace';
            ctx.fillText('HISTORIC ROUTE 66', w / QP[3314], QP[3315]);
            ctx.font = 'bold 13px "Courier New", monospace';
            ctx.fillText(town, w / QP[3316], h / QP[3317] + QP[3318], w - QP[3319]);
            ctx.font = '9px "Courier New", monospace';
            ctx.fillText(`MI ${mile.toFixed(QP[3320])} · CHICAGO`, w / QP[3321], h - QP[3322]);
        }, QP[3323], QP[3324]);
        const board = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[3325], QP[3326]),
            new THREE.MeshStandardMaterial({ map: tex, roughness: QP[3327] })
        );
        board.position.y = QP[3328];
        board.rotation.y = rotY;
        const g = new THREE.Group();
        g.add(pole, board);
        g.position.set(x, QP[3329], z);
        scene.add(g);
        return QP[3330];
    }

    function addTrafficSign(x, z, rotY) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3331], QP[3332], QP[3333], QP[3334]), QP[3335]),
            new THREE.MeshStandardMaterial({ color: QP[3336], roughness: QP[3337], metalness: QP[3338] })
        );
        pole.position.y = QP[3339];

        const labels = ['STOP', 'NO ENTRY', 'ONE WAY', 'YIELD', 'X-ING'];
        const label = pick(labels);
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#c81e2e';
            ctx.fillRect(QP[3340], QP[3341], w, h);
            ctx.fillStyle = '#fff';
            ctx.fillRect(QP[3342], QP[3343], w - QP[3344], h - QP[3345]);
            ctx.fillStyle = '#181818';
            ctx.textAlign = 'center';
            ctx.font = 'bold 13px monospace';
            ctx.fillText(label, w / QP[3346], h / QP[3347] + QP[3348]);
        }, QP[3349], QP[3350]);
        const board = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[3351], QP[3352]),
            new THREE.MeshStandardMaterial({ map: tex, roughness: QP[3353] })
        );
        board.position.y = QP[3354];
        board.rotation.y = rotY;
        g.add(pole, board);
        g.position.set(x, QP[3355], z);
        scene.add(g);
        return QP[3356];
    }

     
     
     
     
     
     
    const trafficSignals = [];  
    function addTrafficSignal(x, z, rotY) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3357], QP[3358], QP[3359], QP[3360]), QP[3361]),
            new THREE.MeshStandardMaterial({ color: QP[3362], roughness: QP[3363], metalness: QP[3364] })
        );
        pole.position.y = QP[3365];
        const box = new THREE.Mesh(
            jitterGeometry(new THREE.BoxGeometry(QP[3366], QP[3367], QP[3368]), QP[3369]),
            new THREE.MeshStandardMaterial({ color: QP[3370], roughness: QP[3371] })
        );
        box.position.y = QP[3372];
        const lampGeo = new THREE.SphereGeometry(QP[3373], QP[3374], QP[3375]);
        const redMat = new THREE.MeshBasicMaterial({ color: QP[3376] });
        const yellowMat = new THREE.MeshBasicMaterial({ color: QP[3377] });
        const greenMat = new THREE.MeshBasicMaterial({ color: QP[3378] });
        registerAnimatedMaterial?.(redMat);
        registerAnimatedMaterial?.(yellowMat);
        registerAnimatedMaterial?.(greenMat);
        const red = new THREE.Mesh(lampGeo, redMat); red.position.set(QP[3379], QP[3380], QP[3381]);
        const yellow = new THREE.Mesh(lampGeo, yellowMat); yellow.position.set(QP[3382], QP[3383], QP[3384]);
        const green = new THREE.Mesh(lampGeo, greenMat); green.position.set(QP[3385], QP[3386], QP[3387]);
        box.add(red, yellow, green);
        g.add(pole, box);
        g.rotation.y = rotY;
        g.position.set(x, QP[3388], z);
        scene.add(g);

        let light = null;
        if (takeDynamicLight(QP[3389])) {
    light = new THREE.PointLight(QP[3390], QP[3391], QP[3392], QP[3393]);
            light.position.set(x + Math.sin(rotY) * QP[3394], QP[3395], z + Math.cos(rotY) * QP[3396]);
            scene.add(light);
        }
        trafficSignals.push({ redMat, yellowMat, greenMat, light, phase: rng() * QP[3397] });
        return QP[3398];
    }

    function addCrate(x, z) {
        const g = new THREE.Group();
        const count = QP[3399] + Math.floor(rng() * QP[3400]);
        for (let i = QP[3401]; i < count; i++) {
            const size = randRange(QP[3402], QP[3403]);
            const crate = new THREE.Mesh(
                jitterGeometry(new THREE.BoxGeometry(size, size, size), size * QP[3404]),
                new THREE.MeshStandardMaterial({ color: QP[3405], roughness: QP[3406] })
            );
            crate.position.set(randRange(QP[3407], QP[3408]), size / QP[3409] + i * (size * QP[3410]), randRange(QP[3411], QP[3412]));
            crate.rotation.y = randRange(QP[3413], QP[3414]);
            g.add(crate);
        }
        g.position.set(x, QP[3415], z);
        scene.add(g);
        return QP[3416];
    }

    function addLantern(x, z) {
        const colorHex = pick(CONFIG.neonPalette);
        const g = new THREE.Group();
        const pole = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3417], QP[3418], QP[3419], QP[3420]), QP[3421]),
            new THREE.MeshStandardMaterial({ color: QP[3422], roughness: QP[3423] })
        );
        pole.position.y = QP[3424];
        const paper = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3425], QP[3426], QP[3427], QP[3428]), QP[3429]),
            new THREE.MeshBasicMaterial({ color: colorHex })
        );
        paper.position.y = QP[3430];
        g.add(pole, paper);
        g.position.set(x, QP[3431], z);
        scene.add(g);

        if (takeDynamicLight(QP[3432])) {
    const light = new THREE.PointLight(colorHex, QP[3433], QP[3434], QP[3435]);
            light.position.set(x, QP[3436], z);
            scene.add(light);
        }
        return QP[3437];
    }

    function addVendingMachine(x, z, facingRotY) {
        const colorHex = pick(CONFIG.neonPalette);
        const body = new THREE.Mesh(
            jitterGeometry(new THREE.BoxGeometry(QP[3438], QP[3439], QP[3440]), QP[3441]),
            new THREE.MeshStandardMaterial({ color: QP[3442], roughness: QP[3443], metalness: QP[3444] })
        );
        body.position.y = QP[3445];
         
         
        const [msg, sub] = pickCityNoisePair(rng, x, z);
        const glowTex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = hexToCss(colorHex);
            ctx.fillRect(QP[3446], QP[3447], w, h);
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.fillRect(QP[3448], QP[3449], w - QP[3450], h - QP[3451]);
            ctx.fillStyle = hexToCss(colorHex);
            ctx.textAlign = 'center';
            ctx.font = 'bold 5px "Courier New", monospace';
            ctx.fillText(msg, w / QP[3452], h / QP[3453] - QP[3454], w - QP[3455]);
            ctx.font = '4px "Courier New", monospace';
            ctx.fillText(sub, w / QP[3456], h / QP[3457] + QP[3458], w - QP[3459]);
        }, QP[3460], QP[3461]);
        const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[3462], QP[3463]),
            new THREE.MeshBasicMaterial({ map: glowTex })
        );
        glow.position.set(QP[3464], QP[3465], QP[3466]);
        const g = new THREE.Group();
        g.add(body, glow);
         
         
         
        const rotY = facingRotY ?? randRange(QP[3467], Math.PI * QP[3468]);
        g.rotation.y = rotY;
        g.position.set(x, QP[3469], z);
        scene.add(g);

        if (takeDynamicLight(QP[3470])) {
    const light = new THREE.PointLight(colorHex, QP[3471], QP[3472], QP[3473]);
            light.position.set(x + Math.sin(rotY) * QP[3474], QP[3475], z + Math.cos(rotY) * QP[3476]);
            scene.add(light);
        }
        return QP[3477];
    }

    function addFenceSegment(x, z, rotY) {
        const fenceTex = makePixelTexture((ctx, w, h) => {
            ctx.clearRect(QP[3478], QP[3479], w, h);
            ctx.strokeStyle = '#e8e0c8';
            ctx.lineWidth = QP[3480];
            for (let i = -h; i < w; i += QP[3481]) {
                ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, QP[3482]); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(i, QP[3483]); ctx.lineTo(i + h, h); ctx.stroke();
            }
        }, QP[3484], QP[3485]);
        fenceTex.magFilter = THREE.NearestFilter;
        const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[3486], QP[3487]),
            new THREE.MeshStandardMaterial({ map: fenceTex, transparent: false, color: QP[3488], roughness: QP[3489] })
        );
        panel.position.y = QP[3490];
        panel.rotation.y = rotY;
        panel.position.set(x, QP[3491], z);
        scene.add(panel);
        return QP[3492];
    }

     
     
    function addMuseumPlacard(x, z, facingRotY) {
        const [title, subtitle] = pick([...CONFIG.siteContent.education, ...CONFIG.siteContent.employment]);
        const g = new THREE.Group();
        const post = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3493], QP[3494], QP[3495], QP[3496]), QP[3497]),
            new THREE.MeshStandardMaterial({ color: QP[3498], roughness: QP[3499], metalness: QP[3500] })
        );
        post.position.y = QP[3501];
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#5a4a28';
            ctx.fillRect(QP[3502], QP[3503], w, h);
            ctx.fillStyle = '#e8d9a0';
            ctx.textAlign = 'center';
            ctx.font = 'bold 9px "Courier New", monospace';
            ctx.fillText(title, w / QP[3504], h / QP[3505] - QP[3506], w - QP[3507]);
            ctx.font = '7px "Courier New", monospace';
            ctx.fillText(subtitle, w / QP[3508], h / QP[3509] + QP[3510], w - QP[3511]);
        }, QP[3512], QP[3513]);
        const plate = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[3514], QP[3515]),
            new THREE.MeshStandardMaterial({ map: tex, roughness: QP[3516], metalness: QP[3517] })
        );
        plate.rotation.x = QP[3518];
         
         
        plate.position.set(QP[3519], QP[3520], QP[3521]);
        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(QP[3522], QP[3523], QP[3524]),
            new THREE.MeshStandardMaterial({ color: QP[3525], roughness: QP[3526], metalness: QP[3527] })
        );
        arm.position.set(QP[3528], QP[3529], QP[3530]);
        g.add(post, arm, plate);
         
         
        g.rotation.y = facingRotY ?? randRange(QP[3531], Math.PI * QP[3532]);
        g.position.set(x, QP[3533], z);
        scene.add(g);
        return QP[3534];
    }

     
     
    function addStickerTag(x, z) {
        const [title, subtitle] = rng() < QP[3538]
            ? pickCityNoisePair(rng, x, z)
            : (rng() < QP[3539]
                ? [getPickPoetryTag()(rng), pick(getPoetryShort())]
                : (Math.random() < QP[3540]
                    ? unseededPick([...CONFIG.siteContent.skills, ...CONFIG.siteContent.about])
                    : (Math.random() < QP[3541]
                        ? pickRandomizedCuratedPair(CONFIG.billboards.flavorWords, 'street', QP[3542])
                        : pickRandomizedLorePair())));
        const neon = pick(CONFIG.neonPalette);
        const font = pickTextFont();
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(QP[3543], QP[3544], w, h);
            ctx.strokeStyle = hexToCss(neon);
            ctx.lineWidth = QP[3545];
            ctx.strokeRect(QP[3546], QP[3547], w - QP[3548], h - QP[3549]);
            ctx.fillStyle = hexToCss(neon);
            ctx.textAlign = 'center';
            ctx.font = `bold 10px ${font}`;
            ctx.fillText(title, w / QP[3550], h / QP[3551] - QP[3552], w - QP[3553]);
            ctx.font = `7px ${font}`;
            ctx.fillStyle = '#ccc';
            ctx.fillText(subtitle, w / QP[3554], h / QP[3555] + QP[3556], w - QP[3557]);
        }, QP[3558], QP[3559]);
        const sticker = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[3560], QP[3561] * (QP[3562] / QP[3563])),
            new THREE.MeshBasicMaterial({ map: tex })
        );
        sticker.rotation.x = -Math.PI / QP[3564];
        sticker.rotation.z = randRange(QP[3565], Math.PI * QP[3566]);
        sticker.position.set(x, QP[3567], z);
        scene.add(sticker);
        return QP[3568];
    }

     
     
     
     
     
    function addWallFlyer(x, y, z, rotY) {
        const [title, subtitle] = rng() < QP[3569]
            ? pickCityNoisePair(rng, x, z)
            : (rng() < QP[3570]
                ? [getPickPoetryTag()(rng), pick(getPoetryMedium())]
                : (Math.random() < QP[3571]
                    ? unseededPick(CONFIG.siteContent.about)
                    : (Math.random() < QP[3572]
                        ? pickRandomizedCuratedPair(CONFIG.billboards.flavorWords, 'street', QP[3573])
                        : pickRandomizedLorePair())));
        const paper = pickPaperColor();
        const ink = pickInkColor();
        const font = pickTextFont();
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = paper;
            ctx.fillRect(QP[3574], QP[3575], w, h);
            ctx.strokeStyle = '#00000030';
            ctx.lineWidth = QP[3576];
            ctx.strokeRect(QP[3577], QP[3578], w - QP[3579], h - QP[3580]);
            ctx.fillStyle = ink;
            ctx.textAlign = 'center';
            ctx.font = `bold 10px ${font}`;
            ctx.fillText(title, w / QP[3581], h / QP[3582] - QP[3583], w - QP[3584]);
            ctx.font = `7px ${font}`;
            ctx.fillText(subtitle, w / QP[3585], h / QP[3586] + QP[3587], w - QP[3588]);
        }, QP[3589], QP[3590]);
        const width = randRange(QP[3591], QP[3592]);
        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(width, width * (QP[3593] / QP[3594])),
            new THREE.MeshStandardMaterial({ map: tex, roughness: QP[3595] })
        );
        plane.position.set(x, y, z);
        plane.rotation.y = rotY + randRange(QP[3596], QP[3597]);  
        scene.add(plane);
    }

     
     
    function addBusinessCardLitter(x, z) {
        const [title, subtitle] = pick(CONFIG.siteContent.contact);
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#e8e4d8';
            ctx.fillRect(QP[3598], QP[3599], w, h);
            ctx.fillStyle = '#1a1a1a';
            ctx.textAlign = 'center';
            ctx.font = 'bold 8px "Courier New", monospace';
            ctx.fillText(title, w / QP[3600], h / QP[3601] - QP[3602], w - QP[3603]);
            ctx.font = '6px "Courier New", monospace';
            ctx.fillText(subtitle, w / QP[3604], h / QP[3605] + QP[3606], w - QP[3607]);
        }, QP[3608], QP[3609]);
        const card = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[3610], QP[3611]),
            new THREE.MeshStandardMaterial({ map: tex, roughness: QP[3612] })
        );
        card.rotation.x = -Math.PI / QP[3613];
        card.rotation.z = randRange(QP[3614], Math.PI * QP[3615]);
        card.position.set(x, QP[3616], z);
        scene.add(card);
        return QP[3617];
    }

     
     
    function addManhole(x, z) {
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#2a2622';
            ctx.beginPath(); ctx.arc(w / QP[3618], h / QP[3619], w / QP[3620] - QP[3621], QP[3622], Math.PI * QP[3623]); ctx.fill();
            ctx.strokeStyle = '#161412';
            ctx.lineWidth = QP[3624];
            for (let i = QP[3625]; i < QP[3626]; i++) {
                const a = (i / QP[3627]) * Math.PI * QP[3628];
                ctx.beginPath();
                ctx.moveTo(w / QP[3629], h / QP[3630]);
                ctx.lineTo(w / QP[3631] + Math.cos(a) * (w / QP[3632] - QP[3633]), h / QP[3634] + Math.sin(a) * (h / QP[3635] - QP[3636]));
                ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(w / QP[3637], h / QP[3638], w * QP[3639], QP[3640], Math.PI * QP[3641]); ctx.stroke();
        }, QP[3642], QP[3643]);
        const disc = new THREE.Mesh(
            new THREE.CircleGeometry(QP[3644], QP[3645]),
            new THREE.MeshStandardMaterial({ map: tex, roughness: QP[3646] })
        );
        disc.rotation.x = -Math.PI / QP[3647];
        disc.rotation.z = randRange(QP[3648], Math.PI * QP[3649]);
        disc.position.set(x, QP[3650], z);
        scene.add(disc);
        return QP[3651];  
    }

     
     
    function addPigeon(x, z) {
        const bodyMat = new THREE.MeshStandardMaterial({ color: pick([QP[3652], QP[3653], QP[3654]]), roughness: QP[3655] });
        const g = new THREE.Group();
        const body = new THREE.Mesh(jitterGeometry(new THREE.SphereGeometry(QP[3656], QP[3657], QP[3658]), QP[3659]), bodyMat);
        body.scale.set(QP[3660], QP[3661], QP[3662]);
        body.position.y = QP[3663];
        const head = new THREE.Mesh(new THREE.SphereGeometry(QP[3664], QP[3665], QP[3666]), bodyMat);
        head.position.set(QP[3667], QP[3668], QP[3669]);
        g.add(body, head);
        g.position.set(x, QP[3670], z);
        g.rotation.y = randRange(QP[3671], Math.PI * QP[3672]);
        scene.add(g);
        return QP[3673];
    }

     
     
     
     
    const overheadCableSegmentBuckets = new Map();
    const overheadCableMaterials = new Map();
    const overheadCableLiveMeshes = new Map();
    function overheadCableBucket(x, z, styleKey) {
        const cx = Math.floor(x / QP[3674]), cz = Math.floor(z / QP[3675]);
        const key = `${cx},${cz}:${styleKey}`;
        let bucket = overheadCableSegmentBuckets.get(key);
        if (!bucket) overheadCableSegmentBuckets.set(key, bucket = { cx, cz, styleKey, positions: [] });
        return bucket;
    }
    function addOverheadCable(xa, za, heightA, xb, zb, heightB) {
         
         
         
        const topA = Math.max(QP[3676], heightA - QP[3677]), topB = Math.max(QP[3678], heightB - QP[3679]);
        const minAttach = QP[3680];
        if (topA < minAttach || topB < minAttach) return false;
        const endYA = randRange(minAttach, Math.min(QP[3681], topA));
        const endYB = randRange(minAttach, Math.min(QP[3682], topB));
        const sagY = Math.max(QP[3683], Math.min(endYA, endYB) - randRange(QP[3684], QP[3685]));
        const isFiber = rng() < QP[3686];
        const color = isFiber ? pick(CONFIG.neonPalette) : QP[3687];
        const styleKey = String(color);
        const bucket = overheadCableBucket((xa + xb) * QP[3688], (za + zb) * QP[3689], styleKey);
        const positions = bucket.positions;
        const segs = QP[3690];
        let px = xa, py = endYA, pz = za;
        for (let i = QP[3691]; i <= segs; i++) {
            const t = i / segs, omt = QP[3692] - t;
            const nx = omt * omt * xa + QP[3693] * omt * t * ((xa + xb) * QP[3694]) + t * t * xb;
            const ny = omt * omt * endYA + QP[3695] * omt * t * sagY + t * t * endYB;
            const nz = omt * omt * za + QP[3696] * omt * t * ((za + zb) * QP[3697]) + t * t * zb;
            positions.push(px, py, pz, nx, ny, nz);
            px = nx; py = ny; pz = nz;
        }
        if (!overheadCableMaterials.has(styleKey)) overheadCableMaterials.set(styleKey, new THREE.LineBasicMaterial({ color }));
        return true;
    }
    function finalizeOverheadCables(log = true) {
        let updated = QP[3698], segments = QP[3699];
        for (const [key, bucket] of overheadCableSegmentBuckets) {
            if (!bucket.positions.length || bucket.flushedLength === bucket.positions.length) continue;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, QP[3700]));
            geo.computeBoundingSphere();
            let lines = overheadCableLiveMeshes.get(key);
            if (!lines) {
                lines = new THREE.LineSegments(geo, overheadCableMaterials.get(bucket.styleKey));
                lines.name = `overheadCables:${key}`;
                overheadCableLiveMeshes.set(key, lines);
                scene.add(lines);
            } else {
                lines.geometry.dispose();
                lines.geometry = geo;
                getStaticWorldOptimizer()?.updateDynamicObject(lines);
            }
            bucket.flushedLength = bucket.positions.length;
            updated++;
            segments += bucket.positions.length / QP[3701];
        }
        if (log && updated) console.log(`[perf] overhead wiring: ${segments} cable segments across ${overheadCableLiveMeshes.size} persistent chunk/style draws (${updated} updated)`);
    }

     
     
     
    function addAwning(x, y, z, rotY, width) {
        const tex = makePixelTexture((ctx, w, h) => {
            const stripeA = pick(['#8a3838', '#38588a', '#8a7838']);
            for (let i = QP[3702]; i < w; i += QP[3703]) {
                ctx.fillStyle = (i / QP[3704]) % QP[3705] === QP[3706] ? stripeA : '#e8ddc2';
                ctx.fillRect(i, QP[3707], QP[3708], h);
            }
        }, QP[3709], QP[3710]);
        const awning = new THREE.Mesh(
            new THREE.PlaneGeometry(width, width * QP[3711]),
            new THREE.MeshStandardMaterial({ map: tex, roughness: QP[3712], side: THREE.DoubleSide })
        );
        awning.rotation.y = rotY;
        awning.rotation.x = -Math.PI / QP[3713];  
        const nx = Math.sin(rotY), nz = Math.cos(rotY);
        awning.position.set(x + nx * (width * QP[3714]), y, z + nz * (width * QP[3715]));
        scene.add(awning);
    }

     
     
     
    function addTree(x, z) {
        const alive = rng() < QP[3716];
        const trunkHeight = randRange(QP[3717], QP[3718]);
        const trunkTilt = alive ? randRange(QP[3719], QP[3720]) : randRange(QP[3721], QP[3722]);
        const trunk = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(randRange(QP[3723], QP[3724]), randRange(QP[3725], QP[3726]), trunkHeight, QP[3727]), QP[3728]),
            new THREE.MeshStandardMaterial({ color: alive ? QP[3729] : QP[3730], roughness: QP[3731] })
        );
        trunk.position.y = trunkHeight / QP[3732];
        trunk.rotation.z = trunkTilt;
        const g = new THREE.Group();
        g.add(trunk);

        if (alive) {
            const canopyColor = pick([QP[3733], QP[3734], QP[3735]]);
            const clumps = QP[3736] + Math.floor(rng() * QP[3737]);
            for (let i = QP[3738]; i < clumps; i++) {
                const s = randRange(QP[3739], QP[3740]);
                const clump = new THREE.Mesh(
                    new THREE.IcosahedronGeometry(s, QP[3741]),
                    new THREE.MeshStandardMaterial({ color: canopyColor, roughness: QP[3742], flatShading: true })
                );
                clump.position.set(randRange(QP[3743], QP[3744]), trunkHeight + randRange(QP[3745], QP[3746]), randRange(QP[3747], QP[3748]));
                clump.scale.set(QP[3749], randRange(QP[3750], QP[3751]), QP[3752]);
                g.add(clump);
            }
        } else {
             
            const branchCount = QP[3753] + Math.floor(rng() * QP[3754]);
            for (let i = QP[3755]; i < branchCount; i++) {
                const len = randRange(QP[3756], QP[3757]);
                const branch = new THREE.Mesh(
                    new THREE.CylinderGeometry(QP[3758], QP[3759], len, QP[3760]),
                    new THREE.MeshStandardMaterial({ color: QP[3761], roughness: QP[3762] })
                );
                branch.position.set(QP[3763], trunkHeight - QP[3764], QP[3765]);
                branch.rotation.z = randRange(QP[3766], QP[3767]);
                branch.rotation.x = randRange(QP[3768], QP[3769]);
                branch.translateY(len / QP[3770]);
                g.add(branch);
            }
        }
        g.position.set(x, QP[3771], z);
        g.rotation.y = randRange(QP[3772], Math.PI * QP[3773]);
        scene.add(g);
        return QP[3774];
    }

     
    function addPottedPlant(x, z) {
        const thriving = rng() < QP[3775];
        const pot = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3776], QP[3777], QP[3778], QP[3779]), QP[3780]),
            new THREE.MeshStandardMaterial({ color: QP[3781], roughness: QP[3782] })
        );
        pot.position.y = QP[3783];
        const g = new THREE.Group();
        g.add(pot);
        const leafColor = thriving ? pick([QP[3784], QP[3785]]) : pick([QP[3786], QP[3787]]);
        const leafCount = thriving ? QP[3788] + Math.floor(rng() * QP[3789]) : QP[3790] + Math.floor(rng() * QP[3791]);
        for (let i = QP[3792]; i < leafCount; i++) {
            const leaf = new THREE.Mesh(
                new THREE.ConeGeometry(QP[3793], randRange(QP[3794], QP[3795]), QP[3796]),
                new THREE.MeshStandardMaterial({ color: leafColor, roughness: QP[3797] })
            );
            leaf.position.set(randRange(QP[3798], QP[3799]), QP[3800] + randRange(QP[3801], QP[3802]), randRange(QP[3803], QP[3804]));
            leaf.rotation.z = randRange(QP[3805], QP[3806]);
            leaf.rotation.x = randRange(QP[3807], QP[3808]);
            g.add(leaf);
        }
        g.position.set(x, QP[3809], z);
        scene.add(g);
        return QP[3810];
    }

     
     
     
     
     
    function addTableWithClutter(x, z) {
        const g = new THREE.Group();
        const legMat = new THREE.MeshStandardMaterial({ color: QP[3811], roughness: QP[3812] });
        const topW = randRange(QP[3813], QP[3814]), topD = randRange(QP[3815], QP[3816]), topH = QP[3817];
        const top = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(topW, QP[3818], topD), QP[3819]), legMat);
        top.position.y = topH;
        g.add(top);
        for (const sx of [QP[3820], QP[3821]]) {
            for (const sz of [QP[3822], QP[3823]]) {
                const leg = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(QP[3824], QP[3825], topH, QP[3826]), QP[3827]), legMat);
                leg.position.set(sx * (topW / QP[3828] - QP[3829]), topH / QP[3830], sz * (topD / QP[3831] - QP[3832]));
                g.add(leg);
            }
        }

        if (rng() < QP[3833]) {  
            const bowl = new THREE.Mesh(
                jitterGeometry(new THREE.CylinderGeometry(QP[3834], QP[3835], QP[3836], QP[3837]), QP[3838]),
                new THREE.MeshStandardMaterial({ color: pick([QP[3839], QP[3840], QP[3841]]), roughness: QP[3842] })
            );
            bowl.position.y = topH + QP[3843];
            g.add(bowl);

            const fruitCount = QP[3844] + Math.floor(rng() * QP[3845]);  
            const fruitColor = pick([QP[3846], QP[3847], QP[3848]]);
            let hasInsect = false;
            for (let i = QP[3849]; i < fruitCount; i++) {
                const fy = topH + QP[3850];
                const fx = randRange(QP[3851], QP[3852]), fz = randRange(QP[3853], QP[3854]);
                const fruit = new THREE.Mesh(
                    new THREE.SphereGeometry(randRange(QP[3855], QP[3856]), QP[3857], QP[3858]),
                    new THREE.MeshStandardMaterial({ color: fruitColor, roughness: QP[3859] })
                );
                fruit.position.set(fx, fy, fz);
                g.add(fruit);

                if (!hasInsect && rng() < QP[3860]) {  
                    hasInsect = true;
                    const insect = new THREE.Mesh(
                        new THREE.SphereGeometry(QP[3861], QP[3862], QP[3863]),
                        new THREE.MeshStandardMaterial({ color: QP[3864] })
                    );
                    insect.position.set(fx, fy + QP[3865], fz);
                    g.add(insect);
                }
            }
        }

        g.rotation.y = randRange(QP[3866], Math.PI * QP[3867]);
        g.position.set(x, QP[3868], z);
        scene.add(g);
        return QP[3869];
    }

     
     
    function addIvyPatch(x, y, z, rotY) {
        const alive = rng() < QP[3870];
        const baseColor = alive ? QP[3871] : QP[3872];
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.clearRect(QP[3873], QP[3874], w, h);
            const shade = hexToCss(baseColor);
            for (let i = QP[3875]; i < QP[3876]; i++) {
                ctx.fillStyle = shade;
                ctx.globalAlpha = randRange(QP[3877], QP[3878]);
                const cx = w / QP[3879] + randRange(-w / QP[3880], w / QP[3881]) * (i / QP[3882]);
                const cy = h - (i / QP[3883]) * h * randRange(QP[3884], QP[3885]);
                ctx.beginPath();
                ctx.arc(cx, cy, randRange(QP[3886], QP[3887]), QP[3888], Math.PI * QP[3889]);
                ctx.fill();
            }
            ctx.globalAlpha = QP[3890];
        }, QP[3891], QP[3892]);
        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(randRange(QP[3893], QP[3894]), randRange(QP[3895], QP[3896])),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
        );
        plane.position.set(x, y, z);
        plane.rotation.y = rotY;
        scene.add(plane);
    }

     
     
     
     
     
     
     
     
    function addPipeCluster(x, z, rotY, wallHeight, maintenance = QP[3897]) {
        const g = new THREE.Group();
        const pipeMat = new THREE.MeshStandardMaterial({
            color: maintenance < QP[3898] ? QP[3899] : QP[3900], roughness: QP[3901], metalness: QP[3902],
        });
        const strapMat = new THREE.MeshStandardMaterial({ color: QP[3903], roughness: QP[3904], metalness: QP[3905] });
        const pipeR = randRange(QP[3906], QP[3907]);
        const topY = Math.min(wallHeight - QP[3908], randRange(QP[3909], QP[3910]));
         
         
        const jointCount = rng() < QP[3911] ? QP[3912] : QP[3913];
        const jointYs = [];
        for (let i = QP[3914]; i <= jointCount; i++) jointYs.push(topY * (i / (jointCount + QP[3915])) + randRange(QP[3916], QP[3917]));
        jointYs.sort((a, b) => a - b);
        const segBounds = [QP[3918], ...jointYs, topY];
        let ox = QP[3919];  
        for (let i = QP[3920]; i < segBounds.length - QP[3921]; i++) {
            const y0 = segBounds[i], y1 = segBounds[i + QP[3922]];
            const seg = new THREE.Mesh(
                jitterGeometry(new THREE.CylinderGeometry(pipeR, pipeR, y1 - y0, QP[3923]), pipeR * QP[3924]),
                pipeMat
            );
            seg.position.set(ox, (y0 + y1) / QP[3925], QP[3926]);
            g.add(seg);
             
            for (let sy = y0 + QP[3927]; sy < y1; sy += QP[3928]) {
                const strap = new THREE.Mesh(new THREE.BoxGeometry(pipeR * QP[3929], QP[3930], QP[3931]), strapMat);
                strap.position.set(ox, sy, QP[3932]);
                g.add(strap);
            }
            if (i < jointYs.length) {
                const nextOx = ox + randRange(QP[3933], QP[3934]);
                const elbow = new THREE.Mesh(
                    jitterGeometry(new THREE.CylinderGeometry(pipeR * QP[3935], pipeR * QP[3936], QP[3937], QP[3938]), pipeR * QP[3939]),
                    pipeMat
                );
                elbow.rotation.x = Math.atan2(nextOx - ox, QP[3940]);
                elbow.position.set((ox + nextOx) / QP[3941], y1, QP[3942]);
                g.add(elbow);
                ox = nextOx;
            }
        }

         
         
        if (rng() < QP[3943]) {
            const bib = new THREE.Mesh(
                jitterGeometry(new THREE.CylinderGeometry(QP[3944], QP[3945], QP[3946], QP[3947]), QP[3948]),
                pipeMat
            );
            bib.rotation.x = Math.PI / QP[3949];
            bib.position.set(QP[3950], randRange(QP[3951], QP[3952]), QP[3953]);
            g.add(bib);
            const wheel = new THREE.Mesh(
                jitterGeometry(new THREE.TorusGeometry(QP[3954], QP[3955], QP[3956], QP[3957]), QP[3958]),
                strapMat
            );
            wheel.position.set(QP[3959], randRange(QP[3960], QP[3961]), QP[3962]);
            g.add(wheel);
        }

         
         
        if (rng() < QP[3963] + (QP[3964] - maintenance) * QP[3965]) {
            const stainY = pick(jointYs.length ? jointYs : [topY * QP[3966]]);
            const tex = makePixelTexture((ctx, w, h) => {
                ctx.clearRect(QP[3967], QP[3968], w, h);
                ctx.fillStyle = 'rgba(120,70,30,0.5)';
                for (let i = QP[3969]; i < QP[3970]; i++) {
                    const cx = w / QP[3971] + randRange(QP[3972], QP[3973]);
                    const cy = (i / QP[3974]) * h;
                    ctx.fillRect(cx - randRange(QP[3975], QP[3976]), cy, randRange(QP[3977], QP[3978]), h / QP[3979] + QP[3980]);
                }
            }, QP[3981], QP[3982]);
            const stain = new THREE.Mesh(
                new THREE.PlaneGeometry(QP[3983], QP[3984]),
                new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
            );
            stain.position.set(ox, Math.max(QP[3985], stainY - QP[3986]), QP[3987]);
            g.add(stain);
        }

        g.rotation.y = rotY;
        g.position.set(x, QP[3988], z);
        scene.add(g);
    }

     
    function addWeeds(x, z) {
        const g = new THREE.Group();
        const alive = rng() < QP[3989];
        const color = alive ? pick([QP[3990], QP[3991], QP[3992]]) : pick([QP[3993], QP[3994]]);
        const blades = QP[3995] + Math.floor(rng() * QP[3996]);
        for (let i = QP[3997]; i < blades; i++) {
            const h = randRange(QP[3998], QP[3999]);
            const blade = new THREE.Mesh(
                new THREE.ConeGeometry(QP[4000], h, QP[4001]),
                new THREE.MeshStandardMaterial({ color, roughness: QP[4002] })
            );
            blade.position.set(randRange(QP[4003], QP[4004]), h / QP[4005], randRange(QP[4006], QP[4007]));
            blade.rotation.z = randRange(QP[4008], QP[4009]);
            g.add(blade);
        }
        g.position.set(x, QP[4010], z);
        scene.add(g);
        return QP[4011];
    }

     
     
     
    let _plazaGlowMaterial = null;
    let _thicketShadeMaterial = null;
    function sharedRadialGroundMaterial(kind) {
        if (kind === 'glow' && _plazaGlowMaterial) return _plazaGlowMaterial;
        if (kind === 'shade' && _thicketShadeMaterial) return _thicketShadeMaterial;
        const isGlow = kind === 'glow';
        const tex = makePixelTexture((ctx, w, h) => {
            const grad = ctx.createRadialGradient(w / QP[4012], h / QP[4013], QP[4014], w / QP[4015], h / QP[4016], w / QP[4017]);
            grad.addColorStop(QP[4018], isGlow ? 'rgba(255,248,220,0.55)' : 'rgba(10,14,8,0.55)');
            grad.addColorStop(QP[4019], isGlow ? 'rgba(255,248,220,0)' : 'rgba(10,14,8,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(QP[4020], QP[4021], w, h);
        }, QP[4022], QP[4023]);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        if (isGlow) _plazaGlowMaterial = mat; else _thicketShadeMaterial = mat;
        return mat;
    }

     
     
     
    function addPlazaGlow(x, z) {
        const patch = new THREE.Mesh(unitPlaneGeo, sharedRadialGroundMaterial('glow'));
        patch.rotation.x = -Math.PI / QP[4024];
        patch.scale.set(CELL * QP[4025], CELL * QP[4026], QP[4027]);
        patch.position.set(x, QP[4028], z);
        scene.add(patch);
        if (takeDynamicLight(QP[4029])) {
    const light = new THREE.PointLight(QP[4030], QP[4031], CELL * QP[4032], QP[4033]);
            light.position.set(x, QP[4034], z);
            scene.add(light);
        }
    }

    function addThicketShade(x, z) {
        const patch = new THREE.Mesh(unitPlaneGeo, sharedRadialGroundMaterial('shade'));
        patch.rotation.x = -Math.PI / QP[4035];
        patch.scale.set(CELL * QP[4036], CELL * QP[4037], QP[4038]);
        patch.position.set(x, QP[4039], z);
        scene.add(patch);
        for (let i = QP[4040]; i < QP[4041]; i++) addWeeds(x + randRange(QP[4042], QP[4043]), z + randRange(QP[4044], QP[4045]));
    }

    function addStatue(x, z) {
        const g = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({ color: QP[4046], roughness: QP[4047] });
        const pedestal = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(QP[4048], QP[4049], QP[4050]), QP[4051]), stoneMat);
        pedestal.position.y = QP[4052];
        const body = new THREE.Mesh(jitterGeometry(new THREE.CapsuleGeometry(QP[4053], QP[4054], QP[4055], QP[4056]), QP[4057]), stoneMat);
        body.position.y = QP[4058];
        const head = new THREE.Mesh(jitterGeometry(new THREE.SphereGeometry(QP[4059], QP[4060], QP[4061]), QP[4062]), stoneMat);
        head.position.y = QP[4063];
        g.add(pedestal, body, head);
        g.position.set(x, QP[4064], z);
        scene.add(g);

        const light = new THREE.SpotLight(QP[4065], QP[4066], QP[4067], Math.PI / QP[4068], QP[4069]);
        light.position.set(x, QP[4070], z);
        light.target = g;
        scene.add(light);
        return QP[4071];
    }

     
     
     
    const JUNK_DESCRIPTORS = [];
    for (const kind of JUNK_BASE_KINDS) {
        for (const wear of JUNK_WEAR_STATES) {
            for (const sizeClass of JUNK_SIZE_CLASSES) {
                const m = wear.sizeMul * sizeClass.mul;
                JUNK_DESCRIPTORS.push({
                    name: `${kind.name} (${wear.tag}, ${sizeClass.tag})`,
                    shape: kind.shape,
                    contexts: kind.contexts,
                    size: kind.size.map(s => [s * m * QP[4345], s * m * QP[4346]]),
                    colors: kind.colors,
                });
            }
        }
    }

     
     
    const JUNK_BY_CONTEXT = new Map();
    for (const d of JUNK_DESCRIPTORS) {
        for (const context of d.contexts) {
            let pool = JUNK_BY_CONTEXT.get(context);
            if (!pool) JUNK_BY_CONTEXT.set(context, pool = []);
            pool.push(d);
        }
    }

     
     
     
     
     
    const JUNK_RENDER_CHUNK = STATIC_BATCH_CHUNK;
    const JUNK_BUCKET_CAPACITY = QP[4347];
    const junkBuckets = new Map();  
    const junkMeshes = new Set();
    const junkGeometryByShape = new Map();
    const junkMaterialByShape = new Map();
    const _junkMatrix = new THREE.Matrix4();
    const _junkPos = new THREE.Vector3();
    const _junkQuat = new THREE.Quaternion();
    const _junkEuler = new THREE.Euler();
    const _junkScale = new THREE.Vector3();
    const _junkColor = new THREE.Color();

    for (const shape of ['box', 'cylinder', 'cone', 'sphere']) {
        let geo;
        switch (shape) {
            case 'box': geo = new THREE.BoxGeometry(QP[4348], QP[4349], QP[4350]); break;
            case 'cylinder': geo = new THREE.CylinderGeometry(QP[4351], QP[4352], QP[4353], QP[4354]); break;
            case 'cone': geo = new THREE.ConeGeometry(QP[4355], QP[4356], QP[4357]); break;
            case 'sphere': geo = new THREE.SphereGeometry(QP[4358], QP[4359], QP[4360]); break;
        }
        jitterGeometry(geo, QP[4361]);
        junkGeometryByShape.set(shape, geo);
        junkMaterialByShape.set(shape, new THREE.MeshStandardMaterial({ roughness: QP[4362] }));
    }

    function junkBucketFor(shape, x, z) {
        const chunkX = Math.floor(x / JUNK_RENDER_CHUNK);
        const chunkZ = Math.floor(z / JUNK_RENDER_CHUNK);
        const key = `${shape}|${chunkX}|${chunkZ}`;
        let list = junkBuckets.get(key);
        if (!list) junkBuckets.set(key, list = []);
        let bucket = list[list.length - QP[4363]];
        if (!bucket || bucket.count >= JUNK_BUCKET_CAPACITY) {
            const originX = chunkX * JUNK_RENDER_CHUNK;
            const originZ = chunkZ * JUNK_RENDER_CHUNK;
            const mesh = new THREE.InstancedMesh(junkGeometryByShape.get(shape), junkMaterialByShape.get(shape), JUNK_BUCKET_CAPACITY);
            mesh.count = QP[4364];
            mesh.position.set(originX, QP[4365], originZ);
            mesh.name = `junk:${shape}:${chunkX},${chunkZ}:${list.length}`;
            scene.add(mesh);
            junkMeshes.add(mesh);
            bucket = { mesh, count: QP[4366], originX, originZ };
            list.push(bucket);
        }
        return bucket;
    }

    function spawnJunkInstance(d, x, z, opts = {}) {
        const bucket = junkBucketFor(d.shape, x, z);
        const { mesh } = bucket;
        const idx = bucket.count++;
        const sizeMul = opts.sizeMul ?? QP[4367];
        const sx = randRange(...d.size[QP[4368]]) * sizeMul, sy = randRange(...d.size[QP[4369]]) * sizeMul, sz = randRange(...d.size[QP[4370]]) * sizeMul;
        const baseY = opts.baseY ?? QP[4371];
        _junkPos.set(x - bucket.originX, baseY + sy / QP[4372], z - bucket.originZ);
        _junkEuler.set(QP[4373], opts.rotY ?? randRange(QP[4374], Math.PI * QP[4375]), QP[4376]);
        _junkQuat.setFromEuler(_junkEuler);
        _junkScale.set(sx, sy, sz);
        _junkMatrix.compose(_junkPos, _junkQuat, _junkScale);
        mesh.setMatrixAt(idx, _junkMatrix);
        mesh.setColorAt(idx, _junkColor.set(pick(d.colors)));
        mesh.count = bucket.count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
         
         
         
         
        if (getStaticWorldOptimizer()) { mesh.boundingSphere = null; mesh.boundingBox = null; }
        return { radius: Math.max(sx, sz) / QP[4377], height: baseY + sy, yMin: baseY, localHeight: sy };
    }

     
     
     
    function scatterJunk(context, x, z, count, spread, axis = null) {
        const pool = JUNK_BY_CONTEXT.get(context) || [];
        if (!pool.length) return;
        for (let i = QP[4378]; i < count; i++) {
             
             
             
             
            let px, pz;
            for (let attempt = QP[4379]; attempt < QP[4380]; attempt++) {
                const [ox, oz] = laneOffset(spread, axis);
                px = x + ox; pz = z + oz;
                const blocked = propCandidatesNear(px, pz, QP[4381]).some(p => {
                    const dx = px - p.x, dz = pz - p.z;
                    return dx * dx + dz * dz < (QP[4382] + p.radius) ** QP[4383];
                });
                if (!blocked) break;
            }
            const { radius, height } = spawnJunkInstance(pick(pool), px, pz);
            propColliders.push({ x: px, z: pz, radius, height });
        }
    }

     
     
     
     
    const PILE_JUNK_BY_CONTEXT = new Map();
    const pileFriendly = /crate|box|bag|bucket|tire|cinderblock|pallet|spool|newspaper|pizza|bottle|can|toolbox|lid|sheet|cord/i;
    for (const [context, pool] of JUNK_BY_CONTEXT) PILE_JUNK_BY_CONTEXT.set(context, pool.filter(d => pileFriendly.test(d.name)));
    PILE_JUNK_BY_CONTEXT.set('rooftop', JUNK_DESCRIPTORS.filter(d => pileFriendly.test(d.name) && !/large\)/i.test(d.name)));

    function pileJunkCluster(context, x, z, opts = {}) {
        const pool = PILE_JUNK_BY_CONTEXT.get(context) || PILE_JUNK_BY_CONTEXT.get('alley') || [];
        if (!pool.length) return null;
        const baseY = opts.baseY ?? QP[4384];
        const tiers = Math.max(QP[4385], opts.tiers ?? (QP[4386] + Math.floor(rng() * QP[4387])));
        const spread = opts.spread ?? QP[4388];
        let bx = opts.backX ?? QP[4389], bz = opts.backZ ?? QP[4390];
        const bl = Math.hypot(bx, bz);
        if (bl > QP[4391]) { bx /= bl; bz /= bl; }
        const tx = -bz, tz = bx;
        const supports = [];
        let topY = baseY;

        const pushPiece = (px, pz, bottomY, sizeMul) => {
            const piece = spawnJunkInstance(pick(pool), px, pz, { baseY: bottomY, sizeMul });
            propColliders.push({ x: px, z: pz, radius: piece.radius, yMin: piece.yMin, height: piece.height });
            supports.push({ x: px, z: pz, radius: piece.radius, top: piece.height });
            topY = Math.max(topY, piece.height);
            return piece;
        };

        const baseCount = Math.max(QP[4392], opts.baseCount ?? (QP[4393] + Math.floor(rng() * QP[4394])));
        for (let i = QP[4395]; i < baseCount; i++) {
            const depth = bl > QP[4396] ? randRange(QP[4397], spread * QP[4398]) : randRange(-spread * QP[4399], spread * QP[4400]);
            const side = randRange(-spread * QP[4401], spread * QP[4402]);
            pushPiece(x + bx * depth + tx * side, z + bz * depth + tz * side, baseY, randRange(QP[4403], QP[4404]));
        }

        let previousTier = supports.slice();
        for (let tier = QP[4405]; tier < tiers; tier++) {
            const nextTier = [];
            const count = Math.max(QP[4406], Math.ceil(baseCount * Math.pow(QP[4407], tier)));
            for (let i = QP[4408]; i < count; i++) {
                const parent = pick(previousTier.length ? previousTier : supports);
                const inward = bl > QP[4409] ? tier * randRange(QP[4410], QP[4411]) : QP[4412];
                const px = parent.x + bx * inward + randRange(-parent.radius * QP[4413], parent.radius * QP[4414]);
                const pz = parent.z + bz * inward + randRange(-parent.radius * QP[4415], parent.radius * QP[4416]);
                const before = supports.length;
                pushPiece(px, pz, parent.top, Math.max(QP[4417], QP[4418] - tier * QP[4419]));
                nextTier.push(supports[before]);
            }
            previousTier = nextTier;
        }

         
         
        const spill = opts.spill ?? (QP[4420] + Math.floor(rng() * QP[4421]));
        for (let i = QP[4422]; i < spill; i++) {
            const outward = bl > QP[4423] ? randRange(-spread * QP[4424], -spread * QP[4425]) : randRange(-spread, spread);
            const side = randRange(-spread, spread);
            pushPiece(x + bx * outward + tx * side, z + bz * outward + tz * side, baseY, randRange(QP[4426], QP[4427]));
        }
        return { x, z, baseY, topY, radius: spread };
    }

    function addConstructionZone(x, z) {
         
        const barrierTex = makePixelTexture((ctx, w, h) => {
            for (let i = QP[4428]; i < w + h; i += QP[4429]) {
                ctx.fillStyle = (i / QP[4430]) % QP[4431] === QP[4432] ? '#ff8a1f' : '#181818';
                ctx.beginPath();
                ctx.moveTo(i, QP[4433]); ctx.lineTo(i + QP[4434], QP[4435]); ctx.lineTo(i + QP[4436] - h, h); ctx.lineTo(i - h, h);
                ctx.fill();
            }
        }, QP[4437], QP[4438]);
        barrierTex.magFilter = THREE.NearestFilter;
        const barrier = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[4439], QP[4440]),
            new THREE.MeshStandardMaterial({ map: barrierTex })
        );
        barrier.position.set(x, QP[4441], z);
        barrier.rotation.y = randRange(QP[4442], Math.PI * QP[4443]);
        scene.add(barrier);

         
         
        const [permitTitle, permitSub] = pickCityNoisePair(rng, x, z);
        const permitTex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#e8dcae';
            ctx.fillRect(QP[4444], QP[4445], w, h);
            ctx.fillStyle = '#181818';
            ctx.textAlign = 'center';
            ctx.font = 'bold 6px "Courier New", monospace';
            ctx.fillText('PERMIT ON FILE', w / QP[4446], QP[4447]);
            ctx.font = 'bold 6px "Courier New", monospace';
            ctx.fillText(permitTitle, w / QP[4448], h / QP[4449] + QP[4450], w - QP[4451]);
            ctx.font = '5px "Courier New", monospace';
            ctx.fillText(permitSub, w / QP[4452], h - QP[4453], w - QP[4454]);
        }, QP[4455], QP[4456]);
        const permit = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[4457], QP[4458]),
            new THREE.MeshStandardMaterial({ map: permitTex, roughness: QP[4459] })
        );
        permit.position.set(x + Math.sin(barrier.rotation.y) * QP[4460], QP[4461], z + Math.cos(barrier.rotation.y) * QP[4462]);
        permit.rotation.y = barrier.rotation.y;
        scene.add(permit);

         
        const poleMat = new THREE.MeshStandardMaterial({ color: QP[4463], roughness: QP[4464], metalness: QP[4465] });
        for (let i = QP[4466]; i < QP[4467]; i++) {
            const px = x + (i % QP[4468] === QP[4469] ? QP[4470] : QP[4471]);
            const pz = z + (i < QP[4472] ? QP[4473] : QP[4474]);
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(QP[4475], QP[4476], QP[4477], QP[4478]), poleMat);
            pole.position.set(px, QP[4479], pz);
            scene.add(pole);
        }
        for (let level = QP[4480]; level < QP[4481]; level++) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(QP[4482], QP[4483], QP[4484]), poleMat);
            bar.position.set(x, QP[4485] + level * QP[4486], z - QP[4487]);
            scene.add(bar);
        }
        addTrafficCone(x - QP[4488], z + QP[4489]);
        addTrafficCone(x + QP[4490], z - QP[4491]);
        scatterJunk('construction', x, z, QP[4492], QP[4493]);
        if (rng() < QP[4494]) placeRealModel('barrelStove', x + randRange(QP[4495], QP[4496]), z + randRange(QP[4497], QP[4498]), randRange(QP[4499], Math.PI * QP[4500]));
        return QP[4501];
    }

     
     
     
     
     
     
     
     
     
     
     
     
    function plazaFacingRotY(c, r) {
        const opens = [[QP[4502], QP[4503]], [QP[4504], QP[4505]], [QP[4506], QP[4507]], [QP[4508], QP[4509]]].filter(([dc, dr]) => grid[r + dr]?.[c + dc] === false);
        if (!opens.length) return undefined;
        let sx = QP[4510], sz = QP[4511];
        for (const [dc, dr] of opens) { sx += dc; sz += dr; }
        if (sx === QP[4512] && sz === QP[4513]) return undefined;  
        return outwardRotationY(sx, sz);
    }

    function addNewsstand(x, z, facingRotY) {
        const [headline, sub] = rng() < QP[4514]
            ? pickCityNoisePair(rng, x, z)
            : pick(CONFIG.billboards.tabloidHeadlines);
        const booth = new THREE.Mesh(
            jitterGeometry(new THREE.BoxGeometry(QP[4515], QP[4516], QP[4517]), QP[4518]),
            new THREE.MeshStandardMaterial({ color: pick([QP[4519], QP[4520], QP[4521]]), roughness: QP[4522] })
        );
        booth.position.y = QP[4523];
        const newsFont = pickTextFont();
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#eee8d8';
            ctx.fillRect(QP[4524], QP[4525], w, h);
            ctx.fillStyle = '#181818';
            ctx.textAlign = 'center';
            ctx.font = `bold 11px ${newsFont}`;
            ctx.fillText(headline, w / QP[4526], h / QP[4527] - QP[4528], w - QP[4529]);
            ctx.font = `8px ${newsFont}`;
            ctx.fillText(sub, w / QP[4530], h / QP[4531] + QP[4532], w - QP[4533]);
        }, QP[4534], QP[4535]);
        const board = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[4536], QP[4537]),
            new THREE.MeshStandardMaterial({ map: tex, roughness: QP[4538] })
        );
        board.position.set(QP[4539], QP[4540], QP[4541]);
        const g = new THREE.Group();
        g.add(booth, board);
        g.rotation.y = facingRotY ?? randRange(QP[4542], Math.PI * QP[4543]);
        g.position.set(x, QP[4544], z);
        scene.add(g);
        return QP[4545];
    }

     
     
    function addPhoneBooth(x, z) {
        const frameMat = new THREE.MeshStandardMaterial({ color: QP[4546], roughness: QP[4547], metalness: QP[4548] });
        const glassMat = new THREE.MeshStandardMaterial({ color: QP[4549], roughness: QP[4550], transparent: true, opacity: QP[4551] });
        const g = new THREE.Group();
        const frame = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(QP[4552], QP[4553], QP[4554]), QP[4555]), frameMat);
        frame.position.y = QP[4556];
        const glass = new THREE.Mesh(new THREE.BoxGeometry(QP[4557], QP[4558], QP[4559]), glassMat);
        glass.position.y = QP[4560];
        g.add(frame, glass);

         
         
        const [dirTitle, dirSub] = pickCityNoisePair(rng, x, z);
        const dirTex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#f0ece0';
            ctx.fillRect(QP[4561], QP[4562], w, h);
            ctx.fillStyle = '#181818';
            ctx.textAlign = 'center';
            ctx.font = 'bold 5px "Courier New", monospace';
            ctx.fillText('DIRECTORY', w / QP[4563], QP[4564]);
            ctx.font = '5px "Courier New", monospace';
            ctx.fillText(dirTitle, w / QP[4565], h / QP[4566], w - QP[4567]);
            ctx.fillText(dirSub, w / QP[4568], h / QP[4569] + QP[4570], w - QP[4571]);
        }, QP[4572], QP[4573]);
        const directory = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[4574], QP[4575]),
            new THREE.MeshStandardMaterial({ map: dirTex, roughness: QP[4576] })
        );
        directory.position.set(QP[4577], QP[4578], QP[4579]);
        directory.rotation.y = Math.PI;
        g.add(directory);

        g.position.set(x, QP[4580], z);
        scene.add(g);

        if (takeDynamicLight(QP[4581])) {
    const light = new THREE.PointLight(QP[4582], QP[4583], QP[4584], QP[4585]);
            light.position.set(x, QP[4586], z);
            scene.add(light);
        }
        return QP[4587];
    }

     
     
    function addAtmKiosk(x, z, facingRotY) {
        const [msg, sub] = rng() < QP[4588]
            ? pickNetworkNoise(rng)
            : pickRandomizedCuratedPair(CONFIG.billboards.systemNoise, 'system', QP[4589]);
        const body = new THREE.Mesh(
            jitterGeometry(new THREE.BoxGeometry(QP[4590], QP[4591], QP[4592]), QP[4593]),
            new THREE.MeshStandardMaterial({ color: QP[4594], roughness: QP[4595], metalness: QP[4596] })
        );
        body.position.y = QP[4597];
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#0a1410';
            ctx.fillRect(QP[4598], QP[4599], w, h);
            ctx.fillStyle = '#3aff6a';
            ctx.textAlign = 'center';
            ctx.font = 'bold 9px "Courier New", monospace';
            ctx.fillText(msg, w / QP[4600], h / QP[4601] - QP[4602], w - QP[4603]);
            ctx.font = '7px "Courier New", monospace';
            ctx.fillText(sub, w / QP[4604], h / QP[4605] + QP[4606], w - QP[4607]);
        }, QP[4608], QP[4609]);
        const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[4610], QP[4611]),
            new THREE.MeshBasicMaterial({ map: tex })
        );
        screen.position.set(QP[4612], QP[4613], QP[4614]);
        const g = new THREE.Group();
        g.add(body, screen);
        g.rotation.y = facingRotY ?? randRange(QP[4615], Math.PI * QP[4616]);
        g.position.set(x, QP[4617], z);
        scene.add(g);

        if (takeDynamicLight(QP[4618])) {
    const light = new THREE.PointLight(QP[4619], QP[4620], QP[4621], QP[4622]);
            light.position.set(x, QP[4623], z + QP[4624]);
            scene.add(light);
        }
        return QP[4625];
    }

    function addCrimeScene(x, z) {
        const rotY = randRange(QP[4626], Math.PI * QP[4627]);
        const tapeTex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#e8d800';
            ctx.fillRect(QP[4628], QP[4629], w, h);
            ctx.fillStyle = '#101010';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('POLICE LINE  DO NOT CROSS  ', QP[4630], h / QP[4631] + QP[4632]);
        }, QP[4633], QP[4634]);
        tapeTex.wrapS = THREE.RepeatWrapping;
        tapeTex.repeat.set(QP[4635], QP[4636]);
        tapeTex.magFilter = THREE.NearestFilter;

        const tape = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[4637], QP[4638]),
            new THREE.MeshBasicMaterial({ map: tapeTex })
        );
        tape.position.set(x, QP[4639], z);
        tape.rotation.y = rotY;
        scene.add(tape);

        for (const side of [QP[4640], QP[4641]]) {
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(QP[4642], QP[4643], QP[4644], QP[4645]),
                new THREE.MeshStandardMaterial({ color: QP[4646] })
            );
            pole.position.set(
                x + Math.sin(rotY) * side * QP[4647],
                QP[4648],
                z + Math.cos(rotY) * side * QP[4649]
            );
            scene.add(pole);
        }

        const chalkTex = makePixelTexture((ctx, w, h) => {
            ctx.clearRect(QP[4650], QP[4651], w, h);
            ctx.strokeStyle = '#f4f4f4';
            ctx.lineWidth = QP[4652];
            ctx.beginPath();
            ctx.ellipse(w / QP[4653], h / QP[4654], w * QP[4655], h * QP[4656], QP[4657], QP[4658], Math.PI * QP[4659]);
            ctx.moveTo(w * QP[4660], h * QP[4661]); ctx.lineTo(w * QP[4662], h * QP[4663]);
            ctx.moveTo(w * QP[4664], h * QP[4665]); ctx.lineTo(w * QP[4666], h * QP[4667]);
            ctx.stroke();
        }, QP[4668], QP[4669]);
        const outline = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[4670], QP[4671]),
            new THREE.MeshBasicMaterial({ map: chalkTex, transparent: true, depthWrite: false })
        );
        outline.rotation.x = -Math.PI / QP[4672];
        outline.position.set(x, QP[4673], z + QP[4674]);
        scene.add(outline);

         
        for (let i = QP[4675]; i < QP[4676]; i++) {
            const marker = new THREE.Mesh(
                new THREE.ConeGeometry(QP[4677], QP[4678], QP[4679]),
                new THREE.MeshStandardMaterial({ color: QP[4680] })
            );
            marker.position.set(x + randRange(QP[4681], QP[4682]), QP[4683], z + randRange(QP[4684], QP[4685]));
            scene.add(marker);
        }
        scatterJunk('crimeScene', x, z, QP[4686], QP[4687]);
        return QP[4688];
    }

    const PROP_BUILDERS = {
        trashCan: addTrashCan,
        trafficCone: addTrafficCone,
        trafficSign: (x, z, facingRotY) => addTrafficSign(x, z, facingRotY ?? randRange(QP[4689], Math.PI * QP[4690])),
        trafficSignal: (x, z, facingRotY) => addTrafficSignal(x, z, facingRotY ?? randRange(QP[4691], Math.PI * QP[4692])),
        mileMarker: (x, z, facingRotY) => addMileMarker(x, z, facingRotY ?? randRange(QP[4693], Math.PI * QP[4694])),
        wantedPoster: (x, z, facingRotY, placement) => addWantedPoster(x, z, facingRotY ?? randRange(QP[4695], Math.PI * QP[4696]), placement),
        crate: addCrate,
        lantern: addLantern,
        vendingMachine: addVendingMachine,
        fenceSegment: (x, z, facingRotY) => addFenceSegment(x, z, facingRotY ?? randRange(QP[4697], Math.PI * QP[4698])),
        museumPlacard: addMuseumPlacard,
        stickerTag: addStickerTag,
        businessCardLitter: addBusinessCardLitter,
        manhole: addManhole,
        pigeon: addPigeon,
        fissureCrack: addFissureCrack,
        tree: addTree,
        pottedPlant: addPottedPlant,
        weeds: addWeeds,
    };

     
     
     
     
     
     
    const PROP_HEIGHTS = {
        trashCan: QP[4699], trafficCone: QP[4700], trafficSign: QP[4701], trafficSignal: QP[4702],
        mileMarker: QP[4703], wantedPoster: QP[4704], crate: QP[4705], lantern: QP[4706],
        vendingMachine: QP[4707], fenceSegment: QP[4708], museumPlacard: QP[4709],
        stickerTag: QP[4710], businessCardLitter: QP[4711], manhole: QP[4712], pigeon: QP[4713],
        fissureCrack: QP[4714], tree: QP[4715], pottedPlant: QP[4716], weeds: QP[4717],
    };

     

    const propColliders = [];  
    const propColliderIndex = new SpatialHash2D(QP[4718]);
    const _propOverlapCandidates = [];
    let maxPropColliderRadius = QP[4719];
    const _nativePropColliderPush = Array.prototype.push;
    propColliders.push = function (...items) {
        for (const item of items) {
            if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.z)) continue;
            const radius = Number.isFinite(item.radius) ? item.radius : QP[4720];
            maxPropColliderRadius = Math.max(maxPropColliderRadius, radius);
            propColliderIndex.insert(item, {
                minX: item.x - radius, maxX: item.x + radius,
                minZ: item.z - radius, maxZ: item.z + radius,
            });
        }
        return _nativePropColliderPush.apply(this, items);
    };
    return Object.freeze({
        addTrashCan,
        addTrafficCone,
        addMileMarker,
        addTrafficSign,
        addTrafficSignal,
        addCrate,
        addLantern,
        addVendingMachine,
        addFenceSegment,
        addMuseumPlacard,
        addStickerTag,
        addWallFlyer,
        addBusinessCardLitter,
        addManhole,
        addPigeon,
        addOverheadCable,
        finalizeOverheadCables,
        addAwning,
        addTree,
        addPottedPlant,
        addTableWithClutter,
        addIvyPatch,
        addPipeCluster,
        addWeeds,
        addPlazaGlow,
        addThicketShade,
        addStatue,
        scatterJunk,
        pileJunkCluster,
        addConstructionZone,
        addNewsstand,
        addPhoneBooth,
        addAtmKiosk,
        addCrimeScene,
        trafficSignals,
        JUNK_RENDER_CHUNK,
        PROP_BUILDERS,
        PROP_HEIGHTS,
        propColliders,
        propCandidatesNear,
        plazaFacingRotY,
    });
}
