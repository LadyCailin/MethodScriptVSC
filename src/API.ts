export class API {
    readonly events : Map<string, APIEvent>;
    readonly functions : Map<string, APIFunction>;
    readonly objects : Map<string, APIObject>;
    readonly keywords : Map<string, APIKeyword>;
    readonly extensions : Map<string, APIExtension>;
    constructor(api : any) {
        this.events = new Map();
        Object.entries(api["events"]).forEach(([event, data]) => {
            this.events.set(event, new APIEvent(data));
        });
        this.functions = new Map();
        Object.entries(api["functions"]).forEach(([func, data]) => {
            this.functions.set(func, new APIFunction(data));
        });
        this.objects = new Map();
        Object.entries(api["objects"]).forEach(([object, data]) => {
            this.objects.set(object, new APIObject(data));
        });
        this.keywords = new Map();
        Object.entries(api["keywords"]).forEach(([keyword, data]) => {
            this.keywords.set(keyword, new APIKeyword(data));
        });
        this.extensions = new Map();
        Object.entries(api["extensions"]).forEach(([extension, data]) => {
            this.extensions.set(extension, new APIExtension(data));
        });
    }
}

export class APIEvent {
    readonly desc : string;
    readonly eventData : APIEventData[];
    readonly mutability : APIEventMutabilityData[];
    readonly prefilters : APIEventPrefilterData[];
    readonly name : string;
    readonly since : APIVersion;
    readonly source : APISource;
    constructor(event : any) {
        this.desc = event["desc"] as string;
        this.eventData = [];
        Object.entries(event["eventData"]).forEach(([key, value]) => {
            this.eventData.push(new APIEventData(key, value as string));
        });
        this.mutability = [];
        Object.entries(event["mutability"]).forEach(([key, value]) => {
            this.mutability.push(new APIEventMutabilityData(key, value as string));
        });
        this.prefilters = [];
        Object.entries(event["prefilters"]).forEach(([key, type]) => {
            this.prefilters.push(new APIEventPrefilterData(key, type as string));
        });
        this.name = event["name"];
        this.since = new APIVersion(event["since"]);
        this.source = new APISource(event["source"]);
    }
}

export class APIEventData {
    readonly name : string;
    readonly desc : string;
    constructor(name : string, desc : string) {
        this.name = name;
        this.desc = desc;
    }
}

export class APIEventMutabilityData {
    readonly name : string;
    readonly desc : string;
    constructor(name : string, desc : string) {
        this.name = name;
        this.desc = desc;
    }
}

export class APIEventPrefilterData {
    readonly name : string;
    readonly type : string;
    constructor(name : string, type : string) {
        this.name = name;
        this.type = type;
    }
}

export class APIFunction {
    readonly args : string;
    readonly coreFunction : boolean;
    readonly desc : string;
    readonly extdesc : string;
    readonly hidden : boolean;
    readonly name : string;
    readonly optimizations : Array<string>;
    readonly restricted : boolean;
    readonly ret : string;
    readonly shortdesc : string;
    readonly since : APIVersion;
    readonly source : APISource;
    readonly thrown : Array<string>;

    constructor(api : any) {
        this.args = api["args"] as string;
        this.coreFunction = api["coreFunction"] as boolean;
        this.desc = api["desc"] as string;
        this.extdesc = api["extdesc"] as string;
        this.hidden = api["hidden"] as boolean;
        this.name = api["name"] as string;
        this.optimizations = [];
        api["optimizations"].forEach((item : string) => this.optimizations.push(item as string));
        this.restricted = api["restricted"] as boolean;
        this.ret = api["ret"] as string;
        this.shortdesc = api["shortdesc"] as string;
        this.since = new APIVersion(api["since"] as string);
        this.source = new APISource(api["source"] as string);
        this.thrown = [];
        api["thrown"].forEach((item : string) => this.thrown.push(item));
    }
}

export class APIObject {
    readonly docs : string;
    readonly interfaces : Array<string>;
    readonly since : APIVersion;
    readonly source : APISource;
    readonly superclasses : Array<string>;
    readonly type : string;
    constructor(api : any) {
        this.docs = api["docs"] as string;
        this.interfaces = [];
        api["interfaces"].forEach((item : string) => this.interfaces.push(item));
        this.since = new APIVersion(api["since"] as string);
        this.source = new APISource(api["source"] as string);
        this.superclasses = [];
        api["superclasses"].forEach((item : string) => this.superclasses.push(item));
        this.type = api["type"] as string;
    }
}

export class APIKeyword {
    readonly docs : string;
    readonly name : string;
    readonly since : APIVersion;
    readonly source : APISource;

    constructor(api : any) {
        this.docs = api["docs"] as string;
        this.name = api["name"] as string;
        this.since = new APIVersion(api["since"] as string);
        this.source = new APISource(api["source"] as string);
    }
}

export class APIExtension {
    readonly id : APISource;
    readonly version : APIVersion;

    constructor(api : any) {
        this.id = new APISource(api["id"] as string);
        this.version = new APIVersion(api["version"] as string);
    }
}

export class APIVersion {
    readonly version : string;
    constructor(version : string) {
        this.version = version;
    }
}

export class APISource {
    readonly source : string;
    constructor(source : string) {
        this.source = source;
    }
}
