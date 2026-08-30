export const BROADCAST_VOICE = Object.freeze({
    nouns: Object.freeze(['CONTROL ROOM','STUDIO FLOOR','TALLY LIGHT','PROGRAM BUS','PREVIEW BUS','VISION MIXER','SWITCHER','PATCH BAY','ROUTER','FRAME SYNC','GENLOCK','TIMECODE','LOWER THIRD','KEYER','CHROMA KEY','TELEPROMPTER','IFB','COMMS BELT PACK','BOOM MIC','SHOTGUN MIC','LAVALIER','FADER','VU METER','PEAK METER','TRANSMITTER','EXCITER','STL LINK','MASTER CLOCK']),
    verbs: Object.freeze(['TAKE CAMERA TWO','STAND BY GRAPHICS','ROLL THE PACKAGE','FADE TO BLACK','CHECK GENLOCK','PATCH THE FEED','OPEN THE FADER','WATCH THE TALLY','CUE THE TALENT','COUNT IT DOWN','CHECK TIMECODE','KEY THE LOWER THIRD','LISTEN TO IFB','ROUTE TO PROGRAM','HOLD PREVIEW']),
    joints: Object.freeze(['ON PROGRAM','IN PREVIEW','BEHIND THE SWITCHER','BEFORE THE TRANSMITTER','AFTER THE ROUTER','AT THE PATCH BAY','UNDER THE TALLY LIGHT','BETWEEN STUDIO AND CONTROL','INSIDE THE IFB','NEXT TO THE MASTER CLOCK'])
});
export const BROADCAST_PAIRS = Object.freeze([
    ['TALLY LIGHT','the camera knows when it is live'],
    ['PREVIEW BUS','see the next thing before committing'],
    ['PROGRAM BUS','the output everyone actually receives'],
    ['GENLOCK','many machines agree on time'],
    ['TIMECODE','frames get addresses'],
    ['IFB','instructions ride in one ear'],
    ['LOWER THIRD','metadata becomes scenery'],
    ['PATCH BAY','routing can be touched'],
    ['FADE TO BLACK','absence can be an intentional transition'],
    ['MASTER CLOCK','the building shares one now'],
    ['ROUTER','one source, many destinations'],
    ['STL LINK','the studio and transmitter do not have to be neighbors']
]);
