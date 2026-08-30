export const AVIATION_VOICE = Object.freeze({
    nouns: Object.freeze(['RUNWAY THRESHOLD','TAXIWAY','HOLD SHORT LINE','LOCALIZER','GLIDESLOPE','VOR','DME','NDB','TRANSPONDER','SQUAWK','ALTIMETER','PITOT TUBE','STATIC PORT','FLAP','SPOILER','TRIM TAB','AILERON','RUDDER','ELEVATOR','APRON','RAMP','JET BRIDGE','BAGGAGE CART','TUG','TOWER FREQUENCY','GROUND FREQUENCY','ATIS','PATTERN ALTITUDE']),
    verbs: Object.freeze(['HOLD SHORT','LINE UP','CHECK THE ALTIMETER','LISTEN TO ATIS','SQUAWK THE CODE','FOLLOW THE TAXIWAY','SET THE TRIM','CHECK THE STATIC PORT','READ BACK','CONTACT GROUND','CLEAR THE RUNWAY','WATCH THE CROSSWIND','VERIFY THE HEADING','IDENT THE NAVAID','TURN BASE']),
    joints: Object.freeze(['AT THE THRESHOLD','BEHIND THE HOLD LINE','ON THE TAXIWAY','BEFORE THE RUNWAY','AFTER THE APRON','UNDER THE GLIDESLOPE','BETWEEN TOWER AND GROUND','AT PATTERN ALTITUDE','PAST THE LOCALIZER','NEXT TO THE RAMP'])
});
export const AVIATION_PAIRS = Object.freeze([
    ['HOLD SHORT','a painted line can be a hard boundary'],
    ['ATIS','the environment announces itself repeatedly'],
    ['LOCALIZER','left and right encoded in radio'],
    ['GLIDESLOPE','vertical guidance without a visible ramp'],
    ['SQUAWK','identity becomes four digits'],
    ['STATIC PORT','still air is a measurement input'],
    ['READ BACK','critical instructions return for verification'],
    ['TAXIWAY','movement before flight has its own road network'],
    ['THRESHOLD','the runway begins before the airplane does'],
    ['TRIM','small force held continuously'],
    ['VOR','direction from phase'],
    ['PATTERN','arrival is a loop before it is a landing']
]);
