import * as THREE from '../vendor/three/three.module.js';
import { QP } from '../runtime/main-quantitative-literals.js';
import { PHOTO_BY_TITLE } from '../content/photo-catalog.js';
import { SIGN_SHAPES, SIGN_FONTS, SIGN_BACKINGS, TEXT_FONTS, PAPER_COLORS, INK_COLORS } from '../content/text-style.js';
import { fitCanvasText, drawCanvasLines } from '../systems/canvas-text.js';

export function createSignageSystem(deps) {
    const {
        CONFIG, QUALITY, candidateFaces, signatureInstances, scene, takeDynamicLight,
        findFreeFacadeRect, fitBladeDimensions, hexToCss, jitterGeometry, makePixelTexture,
        pick, pickRandomizedGraffitiTag, pileJunkCluster, placePhotoPoster, pointOnFacade,
        randRange, rng, safeBladeProjectionDepth, skirtBoxGeo, unitPlaneGeo
    } = deps;
    const flickerLights = [];
    const signBracketMaterial = new THREE.MeshStandardMaterial({ color: QP[2876], roughness: QP[2877], metalness: QP[2878] });
    const signEdgeMaterial = new THREE.MeshStandardMaterial({ color: QP[2879], roughness: QP[2880], metalness: QP[2881] });
    const signBracketCylinderGeo = new THREE.CylinderGeometry(QP[2882], QP[2883], QP[2884], QP[2885]);
    const pickTextFont = () => pick(TEXT_FONTS);
    const pickPaperColor = () => pick(PAPER_COLORS);
    const pickInkColor = () => pick(INK_COLORS);

    const SIGN_BORDER_STYLES = ['solid', 'double', 'cut', 'none'];

    function addSign(x, y, z, rotY, title, subtitle, colorHex, flicker = false, widthOverride = null, shapeOverride = null, armLengthOverride = null) {
         
         
         
         
         
        const shape = shapeOverride ?? pick(SIGN_SHAPES);
        const font = pick(SIGN_FONTS);
        const backing = pick(SIGN_BACKINGS);
        const borderStyle = pick(SIGN_BORDER_STYLES);
        const borderWidth = randRange(QP[2886], QP[2887]);
         
         
        const borderColorHex = rng() < QP[2888] ? pick(CONFIG.neonPalette) : colorHex;

         
         
         
        let width = widthOverride ?? randRange(QP[2889], QP[2890]);
        let armLength = armLengthOverride ?? randRange(QP[2891], QP[2892]);
        const safeDepth = safeBladeProjectionDepth(x, z, rotY);
        const fittedWorld = fitBladeDimensions(width, armLength, safeDepth);
        if (!fittedWorld && Number.isFinite(safeDepth)) return null;
        if (fittedWorld) { width = fittedWorld.width; armLength = fittedWorld.armLength; }
        const height = width * (shape.h / shape.w);
        const panelDepth = randRange(QP[2893], QP[2894]);

        const tex = makePixelTexture((ctx, w, h) => {
            const color = hexToCss(colorHex);
            ctx.fillStyle = backing;
            ctx.fillRect(QP[2895], QP[2896], w, h);
            if (borderStyle !== 'none') {
                ctx.strokeStyle = hexToCss(borderColorHex);
                ctx.lineWidth = borderWidth;
                if (borderStyle === 'cut') {  
                    const c = Math.min(w, h) * QP[2897];
                    ctx.beginPath();
                    ctx.moveTo(c, QP[2898]); ctx.lineTo(w - c, QP[2899]); ctx.lineTo(w - QP[2900], c); ctx.lineTo(w - QP[2901], h - c);
                    ctx.lineTo(w - c, h - QP[2902]); ctx.lineTo(c, h - QP[2903]); ctx.lineTo(QP[2904], h - c); ctx.lineTo(QP[2905], c);
                    ctx.closePath(); ctx.stroke();
                } else {
                    ctx.strokeRect(borderWidth / QP[2906], borderWidth / QP[2907], w - borderWidth, h - borderWidth);
                    if (borderStyle === 'double') {
                        ctx.lineWidth = Math.max(QP[2908], borderWidth * QP[2909]);
                        ctx.strokeRect(borderWidth * QP[2910], borderWidth * QP[2911], w - borderWidth * QP[2912], h - borderWidth * QP[2913]);
                    }
                }
            }
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const textW = Math.max(QP[2914], w - Math.max(QP[2915], borderWidth * QP[2916]));
            const titleFit = fitCanvasText(ctx, title, textW, shape.h > shape.w ? QP[2917] : QP[2918], h * QP[2919], QP[2920], font, 'bold');
            drawCanvasLines(ctx, titleFit, w / QP[2921], h * QP[2922], QP[2923]);
            const subFit = fitCanvasText(ctx, subtitle, textW, shape.h > shape.w ? QP[2924] : QP[2925], h * QP[2926], QP[2927], font);
            drawCanvasLines(ctx, subFit, w / QP[2928], h * QP[2929], QP[2930]);
        }, shape.w, shape.h);

         
         
         

         
         
         
         
         
         
         
         
         
         
         
         
         
         
         
         
        const bracketMat = signBracketMaterial;
        const g = new THREE.Group();

        const plate = new THREE.Mesh(skirtBoxGeo, bracketMat);  
        plate.scale.set(QP[2931], QP[2932], QP[2933]);
        plate.position.set(QP[2934], QP[2935], QP[2936]);
        g.add(plate);

        const arm = new THREE.Mesh(signBracketCylinderGeo, bracketMat);
        arm.scale.set(QP[2937], armLength, QP[2938]);
        arm.rotation.x = Math.PI / QP[2939];  
        arm.position.set(QP[2940], QP[2941], armLength / QP[2942]);
        g.add(arm);

         
         
         
        const braceDrop = armLength * QP[2943];
        const braceLen = Math.hypot(braceDrop, armLength);
        const brace = new THREE.Mesh(signBracketCylinderGeo, bracketMat);
        brace.scale.set(QP[2944], braceLen, QP[2945]);
        brace.rotation.x = Math.atan2(armLength, braceDrop);
        brace.position.set(QP[2946], -braceDrop / QP[2947], armLength / QP[2948]);
        g.add(brace);

         
         
         
         
         
         
         
         
        const edgeMat = signEdgeMaterial;
        const faceMat = new THREE.MeshBasicMaterial({ map: tex });
        const panel = new THREE.Mesh(skirtBoxGeo, [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, faceMat]);
        panel.scale.set(width, height, panelDepth);
        panel.rotation.y = Math.PI / QP[2949];  
        const panelCenterZ = armLength + width / QP[2950];
        panel.position.set(QP[2951], QP[2952], panelCenterZ);
        g.add(panel);

        g.rotation.y = rotY;
        g.position.set(x, y, z);
        scene.add(g);

        if (takeDynamicLight(QP[2953])) {
            const sl = CONFIG.lighting.signLight;
            const light = new THREE.PointLight(colorHex, sl.intensity, sl.distance, sl.decay);
            light.position.set(
                x + Math.sin(rotY) * panelCenterZ,
                y,
                z + Math.cos(rotY) * panelCenterZ
            );
            scene.add(light);
            if (flicker) {
                flickerLights.push({ light, base: sl.intensity, phase: rng() * Math.PI * QP[2954], speed: randRange(QP[2955], QP[2956]), mode: 'sine' });
            }
        }
    }
     
     
     
     
    const GRAFFITI_FONTS = [
        '"Courier New", monospace', 'Consolas, monospace', 'Impact, sans-serif',
        '"Comic Sans MS", cursive', 'Georgia, serif', '"Brush Script MT", cursive',
        'Verdana, sans-serif', '"Lucida Console", monospace',
    ];
    const GRAFFITI_WEIGHTS = ['italic bold', 'bold', 'italic', 'normal'];
    function addGraffitiTag(x, y, z, rotY) {
        const text = pickRandomizedGraffitiTag();
        const colorHex = pick(CONFIG.neonPalette);
        const font = pick(GRAFFITI_FONTS);
        const weight = pick(GRAFFITI_WEIGHTS);
        const fontSize = Math.round(randRange(QP[2957], QP[2958]));
        const jitterAmp = randRange(QP[2959], QP[2960]);
        const rotAmp = randRange(QP[2961], QP[2962]);
        const texH = Math.max(QP[2963], Math.round(fontSize * QP[2964]));
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.clearRect(QP[2965], QP[2966], w, h);
            ctx.fillStyle = hexToCss(colorHex) + 'cc';
            ctx.textAlign = 'left';
            ctx.font = `${weight} ${fontSize}px ${font}`;
            let cx = QP[2967];
            const cy = h / QP[2968] + randRange(QP[2969], QP[2970]);
            for (const ch of text) {
                ctx.save();
                ctx.translate(cx, cy + randRange(-jitterAmp, jitterAmp));
                ctx.rotate(randRange(-rotAmp, rotAmp));
                ctx.fillText(ch, QP[2971], QP[2972]);
                ctx.restore();
                cx += ctx.measureText(ch).width + randRange(QP[2973], QP[2974]);
            }
        }, Math.max(QP[2975], Math.round(text.length * fontSize * QP[2976])), texH);
        const width = randRange(QP[2977], QP[2978]);
        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(width, width * (texH / Math.max(QP[2979], text.length * fontSize * QP[2980]))),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
        );
        plane.position.set(x, y, z);
        plane.rotation.y = rotY;
        scene.add(plane);
    }

     
     
    function addSecurityCamera(x, z, rotY, buildingHeight) {
        const y = randRange(QP[2981], Math.min(buildingHeight - QP[2982], QP[2983]));
        const g = new THREE.Group();
        const bracket = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[2984], QP[2985], QP[2986], QP[2987]), QP[2988]),
            new THREE.MeshStandardMaterial({ color: QP[2989], metalness: QP[2990], roughness: QP[2991] })
        );
        bracket.rotation.z = Math.PI / QP[2992];
        bracket.position.set(QP[2993], QP[2994], QP[2995]);
        const body = new THREE.Mesh(
            jitterGeometry(new THREE.BoxGeometry(QP[2996], QP[2997], QP[2998]), QP[2999]),
            new THREE.MeshStandardMaterial({ color: QP[3000], metalness: QP[3001], roughness: QP[3002] })
        );
        body.position.set(QP[3003], QP[3004], QP[3005]);
        const led = new THREE.Mesh(
            new THREE.SphereGeometry(QP[3006], QP[3007], QP[3008]),
            new THREE.MeshBasicMaterial({ color: QP[3009] })
        );
        led.position.set(QP[3010], QP[3011], QP[3012]);
        g.add(bracket, body, led);
        g.position.set(x, y, z);
        g.rotation.y = rotY;
        scene.add(g);

        if (takeDynamicLight(QP[3013])) {
            const light = new THREE.PointLight(QP[3014], QP[3015], QP[3016], QP[3017]);
            light.position.set(
                x + Math.sin(rotY) * QP[3018], y + QP[3019], z + Math.cos(rotY) * QP[3020]
            );
            scene.add(light);
            flickerLights.push({ light, base: QP[3021], phase: rng() * Math.PI * QP[3022], speed: randRange(QP[3023], QP[3024]), mode: 'blink' });
        }
    }

     
     
    function addRooftopClutter(x, z, footprint, height, maintenance = QP[3025]) {
        const metalMat = new THREE.MeshStandardMaterial({ color: QP[3026], roughness: QP[3027], metalness: QP[3028] });
         
         
         
        const clutterMul = QP[3029] + (QP[3030] - maintenance) * QP[3031];
        const chance = (p) => Math.min(QP[3032], p * clutterMul);

        if (rng() < chance(QP[3033])) {  
            const antenna = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(QP[3034], QP[3035], randRange(QP[3036], QP[3037]), QP[3038]), QP[3039]), metalMat);
            antenna.position.set(x + randRange(-footprint / QP[3040], footprint / QP[3041]), height + antenna.geometry.parameters.height / QP[3042], z + randRange(-footprint / QP[3043], footprint / QP[3044]));
            scene.add(antenna);
        }
        if (rng() < chance(QP[3045])) {  
            const tank = new THREE.Mesh(
                jitterGeometry(new THREE.CylinderGeometry(QP[3046], QP[3047], QP[3048], QP[3049]), QP[3050]),
                new THREE.MeshStandardMaterial({ color: QP[3051], roughness: QP[3052] })
            );
            tank.position.set(x + randRange(-footprint / QP[3053], footprint / QP[3054]), height + QP[3055], z + randRange(-footprint / QP[3056], footprint / QP[3057]));
            scene.add(tank);
        }
        if (rng() < chance(QP[3058])) {  
            const ac = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(QP[3059], QP[3060], QP[3061]), QP[3062]), metalMat);
            ac.position.set(x + randRange(-footprint / QP[3063], footprint / QP[3064]), height + QP[3065], z + randRange(-footprint / QP[3066], footprint / QP[3067]));
            scene.add(ac);
        }
         
         
         
         
        if (rng() < chance(QP[3068])) {  
            const ductLen = randRange(QP[3069], QP[3070]);
            const duct = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(ductLen, QP[3071], QP[3072]), QP[3073]), metalMat);
            const dx = x + randRange(-footprint / QP[3074], footprint / QP[3075]), dz = z + randRange(-footprint / QP[3076], footprint / QP[3077]);
            duct.rotation.y = randRange(QP[3078], Math.PI * QP[3079]);
            duct.position.set(dx, height + QP[3080], dz);
            scene.add(duct);
            for (const side of [QP[3081], QP[3082]]) {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(QP[3083], QP[3084], QP[3085], QP[3086]), metalMat);
                leg.position.set(
                    dx + Math.cos(duct.rotation.y) * side * (ductLen / QP[3087] - QP[3088]), height + QP[3089],
                    dz - Math.sin(duct.rotation.y) * side * (ductLen / QP[3090] - QP[3091])
                );
                scene.add(leg);
            }
        }
        if (rng() < chance(QP[3092])) {  
            const vent = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(QP[3093], QP[3094], QP[3095], QP[3096]), QP[3097]), metalMat);
            const cap = new THREE.Mesh(jitterGeometry(new THREE.ConeGeometry(QP[3098], QP[3099], QP[3100]), QP[3101]), metalMat);
            const vx = x + randRange(-footprint / QP[3102], footprint / QP[3103]), vz = z + randRange(-footprint / QP[3104], footprint / QP[3105]);
            vent.position.set(vx, height + QP[3106], vz);
            cap.position.set(vx, height + QP[3107], vz);
            scene.add(vent, cap);
        }
        if (rng() < chance(QP[3108])) {  
            const pipe = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(QP[3109], QP[3110], QP[3111], QP[3112]), QP[3113]), metalMat);
            const px = x + randRange(-footprint / QP[3114], footprint / QP[3115]), pz = z + randRange(-footprint / QP[3116], footprint / QP[3117]);
            pipe.position.set(px, height + QP[3118], pz);
            const wheel = new THREE.Mesh(new THREE.TorusGeometry(QP[3119], QP[3120], QP[3121], QP[3122]), new THREE.MeshStandardMaterial({ color: QP[3123], roughness: QP[3124] }));
            wheel.position.set(px, height + QP[3125], pz);
            scene.add(pipe, wheel);
        }
        if (rng() < chance(QP[3126])) {  
            const post = new THREE.Mesh(new THREE.CylinderGeometry(QP[3127], QP[3128], QP[3129], QP[3130]), metalMat);
            const box = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(QP[3131], QP[3132], QP[3133]), QP[3134]), new THREE.MeshStandardMaterial({ color: QP[3135], roughness: QP[3136], metalness: QP[3137] }));
            const ux = x + randRange(-footprint / QP[3138], footprint / QP[3139]), uz = z + randRange(-footprint / QP[3140], footprint / QP[3141]);
            post.position.set(ux, height + QP[3142], uz);
            box.position.set(ux, height + QP[3143], uz);
            scene.add(post, box);
        }
         
         
         
        if (footprint > QP[3144] && rng() < chance(QP[3145]) * QUALITY.propDensity) {
            const sx = rng() < QP[3146] ? QP[3147] : QP[3148], sz = rng() < QP[3149] ? QP[3150] : QP[3151];
            const half = footprint / QP[3152];
            const inset = Math.min(QP[3153], half * QP[3154]);
            const px = x + sx * Math.max(QP[3155], half - inset);
            const pz = z + sz * Math.max(QP[3156], half - inset);
            const len = Math.SQRT2;
            pileJunkCluster('rooftop', px, pz, {
                baseY: height, backX: sx / len, backZ: sz / len,
                tiers: QP[3157] + Math.floor(rng() * QP[3158]), spread: Math.min(QP[3159], half * QP[3160]),
                baseCount: QP[3161] + Math.floor(rng() * QP[3162]), spill: QP[3163],
            });
        }
    }

     
     
     
     
     
     
     
     
     
     
    const STANDOFF_DEPTH = QP[3164];
    const standoffBackMaterials = new Map();
    const standoffPegMaterial = new THREE.MeshStandardMaterial({ color: QP[3165], roughness: QP[3166], metalness: QP[3167] });
    const standoffPegGeo = new THREE.CylinderGeometry(QP[3168], QP[3169], QP[3170], QP[3171]);
    function standoffBackMaterial(color) {
        const key = color ?? QP[3172];
        let mat = standoffBackMaterials.get(key);
        if (!mat) {
            mat = new THREE.MeshStandardMaterial({ color: key, roughness: QP[3173], metalness: QP[3174] });
            standoffBackMaterials.set(key, mat);
        }
        return mat;
    }
    function mountStandoffPanel(x, y, z, rotY, width, height, panelMat, opts = {}) {
        const g = new THREE.Group();
        const back = new THREE.Mesh(skirtBoxGeo, standoffBackMaterial(opts.backColor));
        back.scale.set(width * QP[3175], height * QP[3176], QP[3177]);
        back.position.set(QP[3178], QP[3179], QP[3180]);
        g.add(back);

        const pegR = Math.min(width, height) * QP[3181];
        for (const sx of [QP[3182], QP[3183]]) {
            for (const sy of [QP[3184], QP[3185]]) {
                const peg = new THREE.Mesh(standoffPegGeo, standoffPegMaterial);
                peg.scale.set(pegR, STANDOFF_DEPTH, pegR);
                peg.rotation.x = Math.PI / QP[3186];
                peg.position.set(sx * width * QP[3187], sy * height * QP[3188], STANDOFF_DEPTH / QP[3189]);
                g.add(peg);
            }
        }

        const panel = new THREE.Mesh(unitPlaneGeo, panelMat);
        panel.scale.set(width, height, QP[3190]);
        panel.position.set(QP[3191], QP[3192], STANDOFF_DEPTH + QP[3193]);
        g.add(panel);

        g.rotation.y = rotY;
        g.position.set(x, y, z);
        scene.add(g);
        return g;
    }

    function addWallPoster(x, y, z, rotY, title, subtitle) {
         
         
         
        const paper = pickPaperColor();
        const ink = pickInkColor();
        const font = pickTextFont();
        const borderWidth = Math.round(randRange(QP[3194], QP[3195]));
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = paper;
            ctx.fillRect(QP[3196], QP[3197], w, h);
            ctx.strokeStyle = ink;
            ctx.lineWidth = borderWidth;
            ctx.strokeRect(QP[3198], QP[3199], w - QP[3200], h - QP[3201]);
            ctx.fillStyle = ink;
            ctx.textAlign = 'center';
            ctx.font = `bold 15px ${font}`;
            ctx.fillText(title, w / QP[3202], h / QP[3203] - QP[3204], w - QP[3205]);
            ctx.font = `10px ${font}`;
            ctx.fillText(subtitle, w / QP[3206], h / QP[3207] + QP[3208], w - QP[3209]);
        }, QP[3210], QP[3211]);
        const width = randRange(QP[3212], QP[3213]);
        mountStandoffPanel(x, y, z, rotY, width, width * QP[3214], new THREE.MeshStandardMaterial({ map: tex, roughness: QP[3215] }));
    }

     
     
    function addTerminalPlaque(x, y, z, rotY, title, subtitle) {
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#040a04';
            ctx.fillRect(QP[3216], QP[3217], w, h);
            ctx.fillStyle = '#3aff6a';
            ctx.textAlign = 'left';
            ctx.font = '9px "Courier New", monospace';
            ctx.fillText('> ' + title, QP[3218], h / QP[3219] - QP[3220]);
            ctx.fillText('  ' + subtitle, QP[3221], h / QP[3222] + QP[3223]);
            ctx.fillText('_', QP[3224] + ctx.measureText('  ' + subtitle).width, h / QP[3225] + QP[3226]);
            for (let i = QP[3227]; i < h; i += QP[3228]) {
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fillRect(QP[3229], i, w, QP[3230]);
            }
        }, QP[3231], QP[3232]);
        const width = randRange(QP[3233], QP[3234]);
        mountStandoffPanel(x, y, z, rotY, width, width * (QP[3235] / QP[3236]), new THREE.MeshBasicMaterial({ map: tex }), { backColor: QP[3237] });

        if (takeDynamicLight(QP[3238])) {
            const light = new THREE.PointLight(QP[3239], QP[3240], QP[3241], QP[3242]);
            light.position.set(x + Math.sin(rotY) * QP[3243], y, z + Math.cos(rotY) * QP[3244]);
            scene.add(light);
        }
    }

     
     
     
     
     
     
     
     
     
    const CONTENT_CARD_RESERVE = {
        poster: { width: QP[3245], height: QP[3246] * QP[3247] },
        terminal: { width: QP[3248], height: QP[3249] * (QP[3250] / QP[3251]) },
        photo: { width: QP[3252], height: QP[3253] * (QP[3254] / QP[3255]) },
    };

     
     
     
     
     
     
     
     
     
     
    function mountContentCards() {
        const jobs = [];
         
         
         
         
         
         
         
         
        const galleryActive = CONFIG.signatureBuildings?.enabled && CONFIG.signatureBuildings.artGallery?.enabled
            && signatureInstances.some(s => s.type === 'artGallery');
        if (!galleryActive) {
            for (const [title, subtitle] of CONFIG.siteContent.art) jobs.push({ title, subtitle, kind: 'poster' });
            for (const [title, subtitle] of CONFIG.siteContent.webProjects) jobs.push({ title, subtitle, kind: 'poster' });
        }
        for (const [title, subtitle] of CONFIG.siteContent.codeProjects) jobs.push({ title, subtitle, kind: 'terminal' });
        for (const [title, subtitle] of CONFIG.siteContent.lifePhotos) jobs.push({ title, subtitle, kind: 'poster' });

        const faces = [...candidateFaces].sort(() => rng() - QP[3256]);
        let fi = QP[3257];
        for (const job of jobs) {
            const photoKey = PHOTO_BY_TITLE[job.title];
            const kind = photoKey ? 'photo' : job.kind;
            const { width, height } = CONTENT_CARD_RESERVE[kind];
            let placed = false;
            while (!placed && fi < faces.length) {
                const facade = faces[fi++];
                const spot = findFreeFacadeRect(facade, 'poster', width, height, facade.yMin + QP[3258], Math.min(facade.yMax - QP[3259], facade.yMin + QP[3260]));
                if (!spot) continue;  
                const p = pointOnFacade(facade, spot.u, spot.v);
                if (kind === 'photo') placePhotoPoster(photoKey, p.x, p.y, p.z, facade.rotY, job.title, job.subtitle);
                else if (kind === 'poster') addWallPoster(p.x, p.y, p.z, facade.rotY, job.title, job.subtitle);
                else addTerminalPlaque(p.x, p.y, p.z, facade.rotY, job.title, job.subtitle);
                placed = true;
            }
        }
    }

     

     
     
     
     
     
     
     
    const _colliderBox = new THREE.Box3();
    const _colliderSize = new THREE.Vector3();
    return Object.freeze({
        addSign,
        addGraffitiTag,
        addSecurityCamera,
        addRooftopClutter,
        mountStandoffPanel,
        addWallPoster,
        addTerminalPlaque,
        mountContentCards,
        flickerLights,
    });
}
