export const DATACENTER_VOICE = Object.freeze({
    nouns: Object.freeze(['RACK UNIT','COLD AISLE','HOT AISLE','PATCH PANEL','TOP-OF-RACK SWITCH','PDU','UPS','KVM','SERIAL CONSOLE','CRASH CART','FIBER TRAY','CABLE LADDER','BLANKING PANEL','RAISED FLOOR','REMOTE HANDS','BMC','IPMI','POWER FEED','A/B POWER','CAGE NUT','RACK RAIL','TEMPERATURE PROBE','AIRFLOW TILE','UPS BYPASS','GENERATOR TRANSFER','CONSOLE SERVER','ASSET TAG','MAINTENANCE WINDOW']),
    verbs: Object.freeze(['PATCH THE PORT','TRACE THE CABLE','CHECK A/B POWER','WATCH THE INLET TEMP','OPEN THE CONSOLE','MOVE THE LOAD','LABEL BOTH ENDS','SEAT THE CAGE NUT','VERIFY THE UPLINK','FOLLOW THE FIBER','CHECK THE PDU','ROLL THE RACK','DRAIN THE NODE','ENTER MAINTENANCE','BRING THE COLD AISLE BACK']),
    joints: Object.freeze(['IN THE COLD AISLE','BEHIND THE PATCH PANEL','UNDER THE CABLE LADDER','BEFORE THE MAINTENANCE WINDOW','AFTER THE UPS','BETWEEN A AND B POWER','AT THE CONSOLE SERVER','PAST THE CRASH CART','INSIDE THE RACK','ABOVE THE RAISED FLOOR'])
});
export const DATACENTER_PAIRS = Object.freeze([
    ['COLD AISLE','airflow is also architecture'],
    ['A/B POWER','redundancy needs two real paths'],
    ['PATCH PANEL','the map is made of short cables'],
    ['CRASH CART','mobility for a machine that cannot move'],
    ['CAGE NUT','tiny hardware holding expensive certainty'],
    ['REMOTE HANDS','someone still has to touch the box'],
    ['MAINTENANCE WINDOW','time becomes infrastructure'],
    ['CONSOLE SERVER','the side door to every locked machine'],
    ['BLANKING PANEL','empty space still controls airflow'],
    ['ASSET TAG','identity stuck to metal'],
    ['FIBER TRAY','light travels better when organized'],
    ['UPS BYPASS','the emergency route needs a route too']
]);
