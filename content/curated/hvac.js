export const HVAC_VOICE = Object.freeze({
    nouns: Object.freeze(['AIR HANDLER','SUPPLY DUCT','RETURN DUCT','VAV BOX','DAMPER','ACTUATOR','ECONOMIZER','FILTER BANK','DIFFUSER','RETURN GRILLE','STATIC PRESSURE','MANOMETER','BELT DRIVE','BLOWER WHEEL','CONDENSATE PAN','DRAIN TRAP','FREEZE STAT','DUCT SMOKE DETECTOR','THERMISTOR','ZONE SENSOR','BUILDING AUTOMATION','SETPOINT','DEADBAND','MIXED AIR','OUTDOOR AIR','RETURN AIR','SUPPLY AIR','DUCT TRANSITION']),
    verbs: Object.freeze(['CHECK STATIC','OPEN THE DAMPER','VERIFY AIRFLOW','CHANGE THE FILTER','CHECK THE BELT','CLEAR THE DRAIN','READ THE SENSOR','COMMAND THE ACTUATOR','WATCH THE SETPOINT','BALANCE THE BRANCH','CHECK MIXED AIR','TRACE THE ZONE','LISTEN TO THE BLOWER','MEASURE THE DROP','VERIFY THE ECONOMIZER']),
    joints: Object.freeze(['AT THE AIR HANDLER','INSIDE THE RETURN','BEFORE THE FILTER BANK','AFTER THE COIL','UNDER STATIC PRESSURE','PAST THE VAV BOX','AT THE DIFFUSER','BEHIND THE SENSOR','BETWEEN OUTDOOR AND RETURN AIR','IN THE MECHANICAL ROOM'])
});
export const HVAC_PAIRS = Object.freeze([
    ['STATIC PRESSURE','airflow leaves a number behind'],
    ['VAV BOX','one duct, many local decisions'],
    ['FILTER BANK','resistance accumulates quietly'],
    ['ECONOMIZER','sometimes outside air is the cheaper machine'],
    ['DEADBAND','control needs room not to chatter'],
    ['CONDENSATE PAN','cold air makes water'],
    ['DAMPER','a door inside the duct'],
    ['BALANCE','equal enough is measured'],
    ['RETURN AIR','the building breathes back'],
    ['SETPOINT','a number the room keeps arguing with'],
    ['BLOWER WHEEL','the invisible route has a motor'],
    ['DUCT TRANSITION','geometry changes pressure']
]);
