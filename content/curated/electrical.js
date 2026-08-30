export const ELECTRICAL_VOICE = Object.freeze({
    nouns: Object.freeze(['BREAKER PANEL','BRANCH CIRCUIT','SERVICE DISCONNECT','BUS BAR','NEUTRAL BAR','GROUND BAR','CONDUIT','EMT','JUNCTION BOX','PULL BOX','WIRE NUT','TERMINAL BLOCK','CONTACTOR','MOTOR STARTER','OVERLOAD RELAY','TRANSFORMER','CURRENT CLAMP','MEGGER','GROUND ROD','BONDING JUMPER','GFCI','AFCI','LINE VOLTAGE','CONTROL VOLTAGE','PHASE ROTATION','LUG','FERRULE','DIN RAIL']),
    verbs: Object.freeze(['LOCK IT OUT','VERIFY DEAD','TRACE THE CIRCUIT','CHECK PHASE ROTATION','TORQUE THE LUG','BOND THE BOX','PULL THE WIRE','LABEL THE BREAKER','MEASURE CURRENT','CHECK THE NEUTRAL','RESET THE OVERLOAD','TEST THE GFCI','CHECK THE COIL','FOLLOW THE CONDUIT','VERIFY CONTROL VOLTAGE']),
    joints: Object.freeze(['AT THE DISCONNECT','INSIDE THE PANEL','BEHIND THE DEADFRONT','ALONG THE CONDUIT','BEFORE THE CONTACTOR','AFTER THE TRANSFORMER','BETWEEN LINE AND LOAD','UNDER LOCKOUT','AT THE TERMINAL BLOCK','PAST THE JUNCTION BOX'])
});
export const ELECTRICAL_PAIRS = Object.freeze([
    ['VERIFY DEAD','the meter gets the last word'],
    ['BRANCH CIRCUIT','one panel becomes many rooms'],
    ['BONDING JUMPER','metal should agree about ground'],
    ['CONTACTOR','small control closes a large path'],
    ['PHASE ROTATION','three wires can still be in the wrong order'],
    ['OVERLOAD RELAY','the motor gets a second opinion'],
    ['DEADFRONT','the dangerous parts remain real behind the cover'],
    ['DIN RAIL','control logic gets a shelf'],
    ['GFCI','current leaving by the wrong path matters'],
    ['TORQUE THE LUG','loose electricity becomes heat'],
    ['CONTROL VOLTAGE','the quiet circuit tells the loud one what to do'],
    ['LOCKOUT','absence of motion should be intentional']
]);
