export const MACHINING_VOICE = Object.freeze({
    nouns: Object.freeze(['ENGINE LATHE','MILLING MACHINE','CHUCK','COLLET','TAILSTOCK','CROSS SLIDE','COMPOUND REST','TOOL POST','END MILL','FACE MILL','DRILL CHUCK','BORING BAR','REAMER','TAP','DIE','PARALLEL','V-BLOCK','EDGE FINDER','DIAL INDICATOR','MACHINE VISE','SINE BAR','SURFACE PLATE','CUTTING OIL','CHIP PAN','FEED RATE','SPINDLE SPEED','DEPTH OF CUT','BACKLASH']),
    verbs: Object.freeze(['TOUCH OFF','INDICATE THE PART','ZERO THE DIAL','TAKE A SKIM CUT','CHECK THE DIAMETER','BREAK THE EDGE','SET THE FEED','CHANGE THE INSERT','LOCK THE GIB','CLIMB MILL','CONVENTIONAL MILL','CENTER DRILL FIRST','REAM TO SIZE','SNEAK UP ON IT','MEASURE AGAIN']),
    joints: Object.freeze(['IN THE CHUCK','AGAINST THE STOP','ON THE SURFACE PLATE','UNDER THE INDICATOR','BEFORE THE FINISH PASS','AFTER THE ROUGH CUT','BETWEEN CENTERS','AT THE TOOL POST','PAST THE BACKLASH','ON THE PARALLELS'])
});
export const MACHINING_PAIRS = Object.freeze([
    ['TOUCH OFF','the machine needs to know where zero lives'],
    ['BACKLASH','motion can hide inside direction changes'],
    ['SURFACE PLATE','flat enough to judge other things'],
    ['DIAL INDICATOR','small movement becomes a large needle'],
    ['SNEAK UP ON IT','material removed does not grow back'],
    ['CENTER DRILL','start the hole before drilling the hole'],
    ['PARALLELS','support the part where the vise cannot'],
    ['REAMER','finish a hole by trusting the previous hole'],
    ['FEED RATE','speed is only half the motion'],
    ['CHIP PAN','every cut leaves evidence'],
    ['TOOL POST','the cutting edge gets an address'],
    ['FINISH PASS','the last little bit matters disproportionately']
]);
