export const BICYCLES_VOICE = Object.freeze({
    nouns: Object.freeze(['BOTTOM BRACKET','HEADSET','HUB CONE','CUP AND CONE','FREEHUB','CASSETTE','CHAINRING','DERAILLEUR','JOCKEY WHEEL','CABLE HOUSING','BARREL ADJUSTER','BRAKE PAD','ROTOR','RIM','SPOKE','NIPPLE','TRUING STAND','DISH GAUGE','TIRE BEAD','INNER TUBE','PATCH KIT','SEATPOST','STEM','HANDLEBAR','PEDAL THREAD','CHAIN TOOL','QUICK RELEASE','THRU AXLE']),
    verbs: Object.freeze(['TRUE THE WHEEL','CHECK THE DISH','ADJUST THE CONE','INDEX THE GEARS','SET THE LIMIT','BED THE BRAKES','PATCH THE TUBE','SEAT THE BEAD','LUBE THE CHAIN','CHECK THE HEADSET','TORQUE THE STEM','ALIGN THE CALIPER','TURN THE BARREL','BREAK THE CHAIN','SPIN THE WHEEL']),
    joints: Object.freeze(['AT THE HUB','UNDER THE CHAINSTAY','BEHIND THE CASSETTE','BETWEEN THE DROP-OUTS','BEFORE THE DERAILLEUR','AFTER THE CHAINRING','AT THE BRAKE ROTOR','INSIDE THE HEADSET','ON THE TRUING STAND','PAST THE BARREL ADJUSTER'])
});
export const BICYCLES_PAIRS = Object.freeze([
    ['TRUE THE WHEEL','small spoke changes move the rim sideways'],
    ['DISH','centered relative to the frame, not itself'],
    ['BARREL ADJUSTER','tiny turns move the whole shift'],
    ['LIMIT SCREW','the derailleur needs borders'],
    ['CHAIN TOOL','links are replaceable architecture'],
    ['CUP AND CONE','smoothness lives in preload'],
    ['TIRE BEAD','the edge has to agree with the rim'],
    ['HEADSET','steering rotates on hidden bearings'],
    ['BED THE BRAKES','friction needs an introduction'],
    ['SPOKE TENSION','a wheel stands by being pulled'],
    ['PEDAL THREAD','the left side disagrees on purpose'],
    ['FREEHUB','coasting is a mechanical state']
]);
