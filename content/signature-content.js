import { QP } from '../runtime/main-quantitative-literals.js';

 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
export const ART_GALLERY_CATALOG = [
    { id: 'teeth', title: "'TEETH'", subtitle: 'acrylic on canvas', photoKey: 'teeth', aspectRatio: QP[2187] / QP[2188], kind: 'wall', featured: false, room: 'sideGalleryA' },
    { id: 'selfPortrait', title: 'SELF PORTRAIT', subtitle: 'acrylic on canvas', photoKey: 'selfPortrait', aspectRatio: QP[2189] / QP[2190], kind: 'wall', featured: true, room: 'mainGallery' },
    { id: 'garyFischer', title: "'GARY FISCHER'", subtitle: 'india ink on paper', photoKey: 'bike', aspectRatio: QP[2191] / QP[2192], kind: 'wall', featured: false, room: 'sideGalleryA' },
    { id: 'theFish', title: "'THE FISH'", subtitle: 'linoleum print', photoKey: 'linoPrint', aspectRatio: QP[2193] / QP[2194], kind: 'wall', featured: false, room: 'sideGalleryB' },
     
     
     
    { id: 'organicTV', title: 'ORGANIC TV', subtitle: 'cast iron · lost wax', photoKey: null, aspectRatio: null, kind: 'pedestal', featured: true, room: 'courtyard' },
    { id: 'puppetHead', title: 'PUPPET HEAD', subtitle: 'wire & tissue paper', photoKey: 'puppet', aspectRatio: QP[2195] / QP[2196], kind: 'wall', featured: false, room: 'sideGalleryB' },
    { id: 'vitalsage', title: 'VITALSAGE', subtitle: 'wordpress build, 2024', photoKey: 'vitalsage', aspectRatio: QP[2197] / QP[2198], kind: 'wall', featured: false, room: 'upperGallery' },
    { id: 'brandyoupromo', title: 'BRANDYOUPROMO', subtitle: 'asp.net site, 2022', photoKey: 'brandyou', aspectRatio: QP[2199] / QP[2200], kind: 'wall', featured: false, room: 'upperGallery' },
];

 
 
 
 
 
 
 
 
export const AS400_CONTENT = {
     
     
     
    lineage: [
        ['SYSTEM/38', '1978 -- introduced the single-level store & integrated database this whole lineage still runs on'],
        ['AS/400', '1988 -- System/38 and System/36 unified into one machine'],
        ['ISERIES', '2000 rebrand -- same OS lineage, eServer branding era'],
        ['SYSTEM I', '2006 rebrand'],
        ['IBM I', '2008 -- current name; same underlying architecture throughout'],
    ],
     
     
    commands: [
        ['WRKACTJOB', 'work with active jobs'],
        ['WRKOBJ', 'work with objects'],
        ['WRKLIB', 'work with libraries'],
        ['WRKSPLF', 'work with spooled files'],
        ['DSPJOB', 'display job'],
        ['DSPMSG', 'display messages'],
        ['DSPOBJD', 'display object description'],
        ['DSPFD', 'display file description'],
        ['DSPPGMREF', 'display program references'],
        ['CRTLIB', 'create library'],
        ['CRTBNDRPG', 'create bound RPG program'],
        ['CRTSQLRPGI', 'create SQL RPG ILE program'],
    ],
     
     
     
    concepts: [
        ['LIBRARY', 'a container object for other objects -- not a folder; an object of type *LIB'],
        ['OBJECT', 'everything on the system is a typed object (*PGM, *FILE, *LIB...) with attributes, not a raw byte stream'],
        ['DDS', 'Data Description Specifications -- fixed-format file/screen/printer-output layout definitions'],
        ['RPG', 'Report Program Generator -- the platform’s dominant business-logic language, still actively developed'],
        ['CL', 'Control Language -- the shell/scripting language for job & system control'],
        ['ILE', 'Integrated Language Environment -- lets RPG/COBOL/C/CL modules bind into one program'],
        ['JOB', 'the unit of work the OS schedules & tracks -- interactive, batch, or autostart'],
        ['SUBSYSTEM', 'a runtime environment controlling how jobs are routed & given resources'],
        ['MESSAGE QUEUE', 'how jobs/programs communicate & how operators are notified'],
        ['SPOOL FILE', 'print output held on the system before/instead of printing'],
        ['DB2 FOR I', 'the integrated relational database -- built into the OS, not a separate product'],
        ['QSYS2', 'SQL services library -- system information exposed as queryable views'],
        ['IFS', 'Integrated File System -- a Unix-like hierarchical filesystem layered over the object-based one'],
        ['JTOPEN', 'open-source Java toolbox for talking to IBM i from external programs'],
    ],
};
