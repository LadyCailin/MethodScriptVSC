export class API {
    readonly events : Map<string, APIEvent>;
    // readonly functions : Map<string, APIFunction>;
    // readonly objects : Map<string, APIObject>;
    // readonly keywords : Map<string, APIKeyword>;
    // readonly extensions : Map<string, APIExtension>;
    constructor(api : any) {
        this.events = new Map();
        Object.entries(api["events"]).forEach(([event, data]) => {
            this.events.set(event, new APIEvent(data));
        });
        // this.functions = new Map();
        // Object.entries(api["functions"]).forEach(([func, data]) => {
        //     this.functions.set(func, new APIFunction(data));
        // });
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
    
}

export class APIObject {

}

export class APIKeyword {

}

export class APIExtension {

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
