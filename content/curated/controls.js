export const CONTROLS_VOICE = Object.freeze({
    nouns: Object.freeze(['PLC','INPUT CARD','OUTPUT CARD','ANALOG INPUT','ANALOG OUTPUT','RELAY OUTPUT','LADDER LOGIC','FUNCTION BLOCK','STATE MACHINE','HMI','ESTOP LOOP','SAFETY RELAY','LIMIT SWITCH','PROX SENSOR','PHOTOEYE','ENCODER','VFD','MOTOR STARTER','CONTROL TRANSFORMER','24VDC BUS','TERMINAL STRIP','FIELD DEVICE','INTERLOCK','PERMISSIVE','ALARM BIT','FAULT LATCH','SCAN CYCLE','WATCHDOG TIMER']),
    verbs: Object.freeze(['TRACE THE RUNG','CHECK THE INPUT','FORCE NOTHING YET','READ THE INTERLOCK','RESET THE FAULT','VERIFY THE PERMISSIVE','WATCH THE SCAN','CHECK THE ESTOP LOOP','JOG THE MOTOR','READ THE ENCODER','CHECK 24VDC','TRACE THE TERMINAL','WATCH THE ALARM BIT','CLEAR THE LATCH','VERIFY SAFE STATE']),
    joints: Object.freeze(['ON THE RUNG','BEFORE THE OUTPUT','AFTER THE INPUT','INSIDE THE SCAN CYCLE','UNDER THE INTERLOCK','AT THE FIELD DEVICE','PAST THE SAFETY RELAY','BETWEEN PLC AND MOTOR','AT THE TERMINAL STRIP','BEHIND THE HMI'])
});
export const CONTROLS_PAIRS = Object.freeze([
    ['INTERLOCK','one condition keeps another from becoming dangerous'],
    ['PERMISSIVE','yes is assembled from many smaller yeses'],
    ['SCAN CYCLE','the controller rereads reality forever'],
    ['ESTOP LOOP','safety travels a physical path'],
    ['FAULT LATCH','some failures stay remembered'],
    ['HMI','the machine has a face'],
    ['LIMIT SWITCH','geometry becomes a boolean'],
    ['ENCODER','motion becomes countable'],
    ['VFD','frequency becomes speed'],
    ['WATCHDOG TIMER','silence is also a fault'],
    ['TERMINAL STRIP','field reality arrives on screws'],
    ['LADDER LOGIC','old diagrams learned to execute']
]);
