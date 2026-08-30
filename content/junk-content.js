import { QP } from '../runtime/main-quantitative-literals.js';

 
 
 
 
 
 
 
 
 

export const JUNK_BASE_KINDS = [
    { name: 'oil drum', shape: 'cylinder', contexts: ['alley', 'construction'], size: [QP[4072], QP[4073], QP[4074]], colors: [QP[4075], QP[4076], QP[4077]] },
    { name: 'tire', shape: 'cylinder', contexts: ['alley', 'street'], size: [QP[4078], QP[4079], QP[4080]], colors: [QP[4081]] },
    { name: 'cinderblock', shape: 'box', contexts: ['alley', 'construction'], size: [QP[4082], QP[4083], QP[4084]], colors: [QP[4085], QP[4086]] },
    { name: 'wooden pallet', shape: 'box', contexts: ['alley', 'construction'], size: [QP[4087], QP[4088], QP[4089]], colors: [QP[4090], QP[4091]] },
    { name: 'propane tank', shape: 'cylinder', contexts: ['construction', 'alley'], size: [QP[4092], QP[4093], QP[4094]], colors: [QP[4095], QP[4096]] },
    { name: 'traffic barrel', shape: 'cone', contexts: ['construction', 'street'], size: [QP[4097], QP[4098], QP[4099]], colors: [QP[4100], QP[4101]] },
    { name: 'sandbag pile', shape: 'box', contexts: ['construction'], size: [QP[4102], QP[4103], QP[4104]], colors: [QP[4105], QP[4106]] },
    { name: 'rebar bundle', shape: 'cylinder', contexts: ['construction'], size: [QP[4107], QP[4108], QP[4109]], colors: [QP[4110]] },
    { name: 'cable spool', shape: 'cylinder', contexts: ['construction', 'alley'], size: [QP[4111], QP[4112], QP[4113]], colors: [QP[4114], QP[4115]] },
    { name: 'shopping cart', shape: 'box', contexts: ['alley', 'street'], size: [QP[4116], QP[4117], QP[4118]], colors: [QP[4119]] },
    { name: 'milk crate', shape: 'box', contexts: ['alley', 'street', 'indoor'], size: [QP[4120], QP[4121], QP[4122]], colors: [QP[4123], QP[4124], QP[4125]] },
    { name: 'broken chair', shape: 'box', contexts: ['alley', 'indoor'], size: [QP[4126], QP[4127], QP[4128]], colors: [QP[4129], QP[4130]] },
    { name: 'broken table', shape: 'box', contexts: ['alley', 'indoor'], size: [QP[4131], QP[4132], QP[4133]], colors: [QP[4134]] },
    { name: 'mattress roll', shape: 'cylinder', contexts: ['alley', 'indoor'], size: [QP[4135], QP[4136], QP[4137]], colors: [QP[4138], QP[4139]] },
    { name: 'rolled carpet', shape: 'cylinder', contexts: ['alley', 'indoor'], size: [QP[4140], QP[4141], QP[4142]], colors: [QP[4143], QP[4144]] },
    { name: 'cardboard box stack', shape: 'box', contexts: ['alley', 'street', 'indoor'], size: [QP[4145], QP[4146], QP[4147]], colors: [QP[4148], QP[4149]] },
    { name: 'trash bag pile', shape: 'sphere', contexts: ['alley'], size: [QP[4150], QP[4151], QP[4152]], colors: [QP[4153], QP[4154]] },
    { name: 'dumpster lid', shape: 'box', contexts: ['alley'], size: [QP[4155], QP[4156], QP[4157]], colors: [QP[4158], QP[4159]] },
    { name: 'wheelbarrow', shape: 'box', contexts: ['construction'], size: [QP[4160], QP[4161], QP[4162]], colors: [QP[4163], QP[4164]] },
    { name: 'folded ladder', shape: 'box', contexts: ['construction', 'alley'], size: [QP[4165], QP[4166], QP[4167]], colors: [QP[4168], QP[4169]] },
    { name: 'toolbox', shape: 'box', contexts: ['construction', 'indoor'], size: [QP[4170], QP[4171], QP[4172]], colors: [QP[4173], QP[4174], QP[4175]] },
    { name: 'generator unit', shape: 'box', contexts: ['construction'], size: [QP[4176], QP[4177], QP[4178]], colors: [QP[4179], QP[4180]] },
    { name: 'road cone stack', shape: 'cone', contexts: ['street', 'construction'], size: [QP[4181], QP[4182], QP[4183]], colors: [QP[4184]] },
    { name: 'fire hydrant', shape: 'cylinder', contexts: ['street'], size: [QP[4185], QP[4186], QP[4187]], colors: [QP[4188], QP[4189]] },
    { name: 'parking meter', shape: 'cylinder', contexts: ['street'], size: [QP[4190], QP[4191], QP[4192]], colors: [QP[4193], QP[4194]] },
    { name: 'bike rack', shape: 'box', contexts: ['street'], size: [QP[4195], QP[4196], QP[4197]], colors: [QP[4198]] },
    { name: 'bollard', shape: 'cylinder', contexts: ['street'], size: [QP[4199], QP[4200], QP[4201]], colors: [QP[4202], QP[4203]] },
     
     
     
     
     
    { name: 'parked car', shape: 'box', contexts: ['street'], size: [QP[4204], QP[4205], QP[4206]], colors: [QP[4207], QP[4208], QP[4209], QP[4210], QP[4211]] },
    { name: 'delivery van', shape: 'box', contexts: ['street'], size: [QP[4212], QP[4213], QP[4214]], colors: [QP[4215], QP[4216]] },
    { name: 'abandoned bike', shape: 'box', contexts: ['street', 'alley'], size: [QP[4217], QP[4218], QP[4219]], colors: [QP[4220], QP[4221], QP[4222]] },
    { name: 'utility box', shape: 'box', contexts: ['street', 'alley'], size: [QP[4223], QP[4224], QP[4225]], colors: [QP[4226], QP[4227]] },
    { name: 'vent cap', shape: 'cylinder', contexts: ['alley'], size: [QP[4228], QP[4229], QP[4230]], colors: [QP[4231]] },
    { name: 'satellite dish scrap', shape: 'cone', contexts: ['alley'], size: [QP[4232], QP[4233], QP[4234]], colors: [QP[4235], QP[4236]] },
    { name: 'broken umbrella', shape: 'cone', contexts: ['alley'], size: [QP[4237], QP[4238], QP[4239]], colors: [QP[4240], QP[4241]] },
    { name: 'picnic table', shape: 'box', contexts: ['park'], size: [QP[4242], QP[4243], QP[4244]], colors: [QP[4245]] },
    { name: 'litter bin', shape: 'cylinder', contexts: ['park', 'street', 'plaza'], size: [QP[4246], QP[4247], QP[4248]], colors: [QP[4249], QP[4250]] },
    { name: 'planter box', shape: 'box', contexts: ['park', 'plaza'], size: [QP[4251], QP[4252], QP[4253]], colors: [QP[4254], QP[4255]] },
    { name: 'birdbath', shape: 'cylinder', contexts: ['park'], size: [QP[4256], QP[4257], QP[4258]], colors: [QP[4259]] },
    { name: 'evidence marker', shape: 'cone', contexts: ['crimeScene'], size: [QP[4260], QP[4261], QP[4262]], colors: [QP[4263]] },
    { name: 'broken bottle pile', shape: 'sphere', contexts: ['crimeScene', 'alley'], size: [QP[4264], QP[4265], QP[4266]], colors: [QP[4267], QP[4268]] },
    { name: 'tarp-covered pile', shape: 'box', contexts: ['crimeScene', 'construction'], size: [QP[4269], QP[4270], QP[4271]], colors: [QP[4272], QP[4273]] },
    { name: 'road flare', shape: 'cylinder', contexts: ['street', 'crimeScene'], size: [QP[4274], QP[4275], QP[4276]], colors: [QP[4277]] },
    { name: 'sawhorse', shape: 'box', contexts: ['construction', 'street'], size: [QP[4278], QP[4279], QP[4280]], colors: [QP[4281], QP[4282]] },
    { name: 'newspaper stack', shape: 'box', contexts: ['alley', 'street', 'indoor'], size: [QP[4283], QP[4284], QP[4285]], colors: [QP[4286], QP[4287]] },
    { name: 'pizza box', shape: 'box', contexts: ['alley', 'indoor'], size: [QP[4288], QP[4289], QP[4290]], colors: [QP[4291], QP[4292]] },
    { name: 'discarded umbrella skeleton', shape: 'cone', contexts: ['alley', 'street'], size: [QP[4293], QP[4294], QP[4295]], colors: [QP[4296]] },
    { name: 'plastic bucket', shape: 'cylinder', contexts: ['alley', 'construction', 'indoor'], size: [QP[4297], QP[4298], QP[4299]], colors: [QP[4300], QP[4301], QP[4302]] },
    { name: 'coiled extension cord', shape: 'cylinder', contexts: ['construction', 'indoor'], size: [QP[4303], QP[4304], QP[4305]], colors: [QP[4306], QP[4307]] },
    { name: 'fallen road sign', shape: 'box', contexts: ['street', 'construction'], size: [QP[4308], QP[4309], QP[4310]], colors: [QP[4311], QP[4312]] },
    { name: 'street food cart', shape: 'box', contexts: ['plaza', 'street'], size: [QP[4313], QP[4314], QP[4315]], colors: [QP[4316], QP[4317], QP[4318]] },
    { name: 'stray cardboard sheet', shape: 'box', contexts: ['alley'], size: [QP[4319], QP[4320], QP[4321]], colors: [QP[4322]] },
    { name: 'crushed can', shape: 'cylinder', contexts: ['alley', 'street', 'indoor'], size: [QP[4323], QP[4324], QP[4325]], colors: [QP[4326], QP[4327], QP[4328]] },
    { name: 'broken skateboard', shape: 'box', contexts: ['alley', 'street'], size: [QP[4329], QP[4330], QP[4331]], colors: [QP[4332], QP[4333]] },
    { name: 'shopping bag pile', shape: 'sphere', contexts: ['alley', 'street'], size: [QP[4334], QP[4335], QP[4336]], colors: [QP[4337], QP[4338], QP[4339]] },
];

export const JUNK_WEAR_STATES = [
    { tag: 'fresh', sizeMul: QP[4340] },
    { tag: 'weathered', sizeMul: QP[4341] },
];

export const JUNK_SIZE_CLASSES = [
    { tag: 'small', mul: QP[4342] }, { tag: 'medium', mul: QP[4343] }, { tag: 'large', mul: QP[4344] },
];
