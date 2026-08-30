export const METROLOGY_VOICE = Object.freeze({
    nouns: Object.freeze(['CALIPER','MICROMETER','DEPTH MIC','HEIGHT GAUGE','DIAL TEST INDICATOR','GAUGE BLOCK','PIN GAUGE','FEELER GAUGE','THREAD PITCH GAUGE','RADIUS GAUGE','SURFACE PLATE','STRAIGHTEDGE','PRECISION SQUARE','TORQUE WRENCH','TACHOMETER','MANOMETER','THERMOCOUPLE','RTD','CLAMP METER','OSCILLOSCOPE','REFERENCE STANDARD','TOLERANCE','DATUM','RUNOUT','REPEATABILITY','RESOLUTION','UNCERTAINTY','CALIBRATION STICKER']),
    verbs: Object.freeze(['ZERO FIRST','CHECK THE DATUM','MEASURE TWICE','COMPARE TO STANDARD','WATCH THE RUNOUT','REPEAT THE READING','LOG THE VALUE','CHECK THE RANGE','USE THE RIGHT SCALE','VERIFY CALIBRATION','MEASURE HOT','MEASURE COLD','CHECK BOTH ENDS','READ THE TOLERANCE','DON’T ROUND EARLY']),
    joints: Object.freeze(['AGAINST THE DATUM','ON THE SURFACE PLATE','INSIDE TOLERANCE','OUTSIDE TOLERANCE','BEFORE CALIBRATION','AFTER ZEROING','AT FULL SCALE','BETWEEN READINGS','UNDER REPEATABILITY','NEXT TO THE REFERENCE STANDARD'])
});
export const METROLOGY_PAIRS = Object.freeze([
    ['DATUM','agreement begins somewhere'],
    ['TOLERANCE','correctness has width'],
    ['REPEATABILITY','one measurement is a story'],
    ['RESOLUTION','more digits are not always more truth'],
    ['GAUGE BLOCK','a dimension stored in steel'],
    ['RUNOUT','rotation reveals misalignment'],
    ['ZERO FIRST','reference before confidence'],
    ['CALIBRATION','the measuring tool also gets measured'],
    ['UNCERTAINTY','honesty has units'],
    ['SURFACE PLATE','flatness as infrastructure'],
    ['PIN GAUGE','sometimes the answer either fits or does not'],
    ['LOG THE VALUE','memory is not instrumentation']
]);
