export const PLUMBING_VOICE = Object.freeze({
    nouns: Object.freeze(['SUPPLY RISER','RETURN LINE','TRAP','VENT STACK','CLEANOUT','BALL VALVE','GATE VALVE','CHECK VALVE','UNION','COUPLING','REDUCER','TEE','ELBOW','FLOOR DRAIN','SUMP','BACKFLOW PREVENTER','PRESSURE REDUCER','HOSE BIBB','PEX MANIFOLD','COPPER RISER','CAST IRON STACK','DIELECTRIC UNION','PIPE HANGER','ESCUTCHEON','WATER HAMMER ARRESTOR','STRAINER','SERVICE VALVE','DRAIN COCK']),
    verbs: Object.freeze(['FOLLOW THE RISER','OPEN THE CLEANOUT','CHECK THE TRAP','ISOLATE THE BRANCH','WATCH THE PRESSURE','DRAIN THE LINE','VENT THE HIGH POINT','CHECK FOR BACKFLOW','TIGHTEN THE UNION','FLUSH THE STRAINER','FIND THE SHUTOFF','LISTEN FOR HAMMER','SUPPORT THE PIPE','CHECK THE SLOPE','PRIME THE TRAP']),
    joints: Object.freeze(['BEHIND THE CLEANOUT','UNDER THE FLOOR DRAIN','ABOVE THE TRAP','BEFORE THE BACKFLOW PREVENTER','AFTER THE SERVICE VALVE','ALONG THE RISER','PAST THE UNION','INSIDE THE CHASE','AT THE MANIFOLD','BELOW THE VENT STACK'])
});
export const PLUMBING_PAIRS = Object.freeze([
    ['CLEANOUT','access is part of the design'],
    ['TRAP','a little water keeps a big smell out'],
    ['VENT STACK','air is part of drainage'],
    ['BACKFLOW PREVENTER','direction matters even to water'],
    ['UNION','future disassembly planned in advance'],
    ['FLOOR DRAIN','gravity gets an address'],
    ['PIPE HANGER','the route has weight'],
    ['WATER HAMMER','momentum knocks on the wall'],
    ['CHECK VALVE','one direction preferred'],
    ['MANIFOLD','one source becomes named branches'],
    ['SERVICE VALVE','isolate before becoming brave'],
    ['SLOPE','small angle, permanent consequence']
]);
