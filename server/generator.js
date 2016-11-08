// (C) Copyright 2014-2015 Hewlett Packard Enterprise Development LP

var data = require('./data');

// derived from http://stackoverflow.com/questions/521295/javascript-random-seeds
var seed = 1234;
function random (scale) {
  var x = Math.sin(seed++) * 10000;
  return Math.round((x - Math.floor(x)) * scale);
}

var INITIALIZE_STEP_INTERVAL = 5000;
var RESOURCE_COUNT = 20;
var START_DATE = new Date();
var USERS = ['Administrator', 'Vince', 'Ursula'];

var SCHEMA = [
  {
    name: "virtual-machines",
    count: RESOURCE_COUNT,
    prefix: [
      "Sandbox DevTest",
      "Grommet Eval",
      "Internal Project",
      "Data Colaboration",
      "12 Factor Experiment"
    ],
    attributes: [{
      image: {
        uri: "/rest/images/4",
        name: "ubuntu-15.10-server-amd64.iso"
      },
      networks: [{
        uri: "/rest/networks/1",
        name: "production",
        addresses: ["10.0.0.1"]
      }],
      size: {
        uri: "/rest/virtual-machine-sizes/2",
        name: "Medium",
        vCpus: 4,
        memory: 8,
        diskSpace: 200
      }
      // utilization data will be added later in customize()
    }],
    associations: {
      "VIRTUAL_MACHINE_TO_SNAPSHOT": {
        category: "snapshots",
        count: 3,
        share: false,
        childUriAttribute: "virtualMachineUri"
      }
    }
  },
  {
    name: "virtual-machine-sizes",
    count: 3,
    noStatus: true,
    attributes: [{
      name: "Small",
      vCpus: 1,
      memory: 2, // GB
      diskSpace: 10 // GB
    }, {
      name: "Medium",
      vCpus: 2,
      memory: 8,
      diskSpace: 200
    }, {
      name: "Large",
      vCpus: 4,
      memory: 64,
      diskSpace: 600
    }],
    noStatus: true
  },
  {
    name: "os-types",
    count: 6,
    noStatus: true,
    attributes: [
      {name: "Windows 10"},
      {name: "RedHat Linux"},
      {name: "CentOS Linux"},
      {name: "SuSE Linux"},
      {name: "Windows XP"},
      {name: "Windows 8"}
    ]
  },
  {
    name: "images",
    count: 6,
    noStatus: true,
    names: [
      "CentOS-7-x86_64-1503-01.iso",
      "openSUSE-Leap-42.1-x86_64.iso",
      "ubuntu-15.10-server-amd64.iso",
      "ubuntu-15.10-server-i386.iso",
      "Win2k12r2.ova",
      "windows-2008-vm.ova"
    ],
    attributes: [{
      size: 10
    }, {
      size: 21
    }]
  },
  {
    name: "networks",
    count: 4,
    noStatus: true,
    attributes: [
      {name: "production", vLanId: 101},
      {name: "management", vLanId: 102},
      {name: "backup", vLanId: 103},
      {name: "development", vLanId: 104}
    ]
  },
  {
    name: "snapshots",
    count: RESOURCE_COUNT,
    noStatus: true,
    names: ["stable", "recovery", "evaluation", "tested"]
  },
  {
    name: "appliances",
    names: ["appliance"],
    count: 1
  },
  {
    name: "alerts",
    names: [
      "Temperature threshold exceeded by 10 degrees.",
      "Unable to establish management contact with the service processor.",
      "Inconsistent configuration detected.",
      "Utilization data has not been successfully collected for 50 minutes and 5 attempts. Communication with iLO management processor 172.18.6.3 failed. The iLO experienced an internal error."
    ]
  },
  {
    name: "tasks",
    names: ["Add", "Update", "Remove", "Restart"]
  }
];

function historicalData(min, max, count) {
  var result = [];
  var date = new Date(START_DATE.getTime());
  for (var i=1; i<=count; i+=1) {
    result.push([date.toISOString(), random(max - min)]);
    date.setTime(date.getTime() - (i * 5000));
  }
  return result;
}

function distribute (values) {
  var result;
  for (var i = 0; i < values.length; i++) {
    if (Array.isArray(values[i])) {
      if (random(values[i][1]) === 0) {
        result = values[i][0];
        break;
      }
    } else {
      result = values[i];
      break;
    }
  }
  return result;
}

function createCategories () {
  SCHEMA.forEach(function (category) {
    data.addCategory(category.name);
  });
}

function alertForResource (resource, index) {
  var alerts = SCHEMA.filter(function (category) {
    return 'alerts' === category.name;
  })[0];
  var alert = {
    name: alerts.names[index % alerts.names.length],
    state: 'Active',
    status: resource.status,
    uri: '/rest/alerts/r' + index + '-' + resource.category,
    category: 'alerts',
    created: resource.created,
    modified: resource.modified,
    attributes: {
      associatedResourceCategory: resource.category,
      associatedResourceUri: resource.uri,
      associatedResourceName: resource.name
    }
  };

  data.addResource('alerts', alert);
}

function buildItem (options) { //categoryName, index, name, date) {
  var category = options.category;

  var resource = {
    name: options.name,
    state: 'Online',
    uri: '/rest/' + category.name + '/' + options.index,
    category: category.name,
    created: options.date.toISOString(),
    modified: options.date.toISOString()
  };

  if (!category.noStatus) {
    var statusDistribution = ('alerts' === category.name ?
      [['Critical', 7], 'Warning'] :
      [['Disabled', 3], ['Warning', 5], ['Critical', 7], 'OK']);
    resource.status = distribute(statusDistribution);
    if ('Disabled' === resource.status) {
      resource.state = 'Offline';
    }
  }

  if (options.attributes) {
    resource._indexAttributes = options.attributes;
    resource._resourceAttributes = options.attributes;
  }

  // ensure alerts for non-OK and non-Unknown resources
  if (resource.status && 'OK' !== resource.status &&
    'Disabled' !== resource.status &&
    'alerts' !== category.name && 'tasks' !== category.name &&
    'appliances' !== category.name) {
    alertForResource(resource, options.index);
  }

  return resource;
}

function buildItems (category) {
  var date = new Date();
  var count = category.count || RESOURCE_COUNT;

  for (var i = 1; i <= count; i++) {
    var name;
    var attributes;
    if (category.prefix) {
      if (Array.isArray(category.prefix)) {
        name = category.prefix[i % category.prefix.length] + ' ' + i;
      } else {
        name = category.prefix + ' ' + i;
      }
    } else if (category.names) {
      name = category.names[i % category.names.length];
    }

    if (category.attributes) {
      attributes = category.attributes[i % category.attributes.length];
      if (attributes.name) {
        name = attributes.name;
      }
    }
    var options = {
      category: category,
      index: i,
      name: name,
      date: date,
      attributes: attributes
    };
    var resource = buildItem(options);

    data.addResource(category.name, resource);

    // randomly reduce timestamp for the next item
    date.setDate(date.getDate() - random(5) + 1);
  }
}

function createResources () {
  SCHEMA.forEach(function (category) {
    buildItems(category);
  });
}

function createActivity () {
  // associate alerts and tasks with resources
  var resources = [];
  SCHEMA.filter(function (category) {
    return ('alerts' !== category.name && 'tasks' !== category.name &&
      'appliances' !== category.name);
  }).forEach(function (category) {
    resources = resources.concat(data.getItems(category.name));
  });
  var date = new Date();

  var index = 0;
  data.getItems('alerts', true).forEach(function(alert) {
    if ('Active' !== alert.state) {
      var resource = resources[index];
      index += 1;
      alert.attributes = {
        associatedResourceCategory: resource.category,
        associatedResourceUri: resource.uri,
        associatedResourceName: resource.name
      };
      alert.state = 'Cleared';
      alert.status = distribute([['Critical', 5], ['Warning', 3], 'OK']);
      alert.created = date.toISOString();
      alert.modified = date.toISOString();

      // randomly reduce timestamp for the next item
      date.setHours(date.getHours() - random(20) + 1);
    }
  });

  index = 0;
  date = new Date();
  data.getItems('tasks', true).forEach(function(task) {
    var resource = resources[index];
    index += 1;
    task.attributes = {
      associatedResourceCategory: resource.category,
      associatedResourceUri: resource.uri,
      associatedResourceName: resource.name,
      parentTaskUri: null,
      owner: USERS[index % USERS.length]
    };
    task.state = distribute([['Running', 5], ['Critical', 6], ['Warning', 3], 'Completed']);
    var taskStateMap = {
      'Completed': 'OK',
      'Warning': 'Warning',
      'Critical': 'Critical'
    };

    var createdDate;
    if ('Running' === task.state) {
      task.status = 'Unknown';
      var modifiedDate = new Date();
      createdDate = new Date(modifiedDate.getTime());
      createdDate.setMinutes(createdDate.getMinutes() - random(20) + 1);
      task.created = createdDate.toISOString();
      task.modified = modifiedDate.toISOString();
      task.percentComplete = random(90);
    } else {
      task.status = taskStateMap[task.state];
      createdDate = new Date(date.getTime());
      createdDate.setMinutes(createdDate.getMinutes() - random(20) + 1);
      task.created = createdDate.toISOString();
      task.modified = date.toISOString();
      task.percentComplete = 100;
    }

    // randomly reduce timestamp for the next item
    date.setHours(date.getHours() - random(20) + 1);
  });
}

function createAssociations () {
  SCHEMA.forEach(function (category) {
    if (category.hasOwnProperty('associations')) {

      for (var name in category.associations) {
        if (category.associations.hasOwnProperty(name)) {

          var schema = category.associations[name];
          var parents = data.getItems(category.name);
          var children = data.getItems(schema.category);
          var childIndex = 0;

          parents.forEach(function(parent) {
            for (var i = 0; i < schema.count; i++) {
              if (childIndex < children.length) {
                var child = children[childIndex];
                data.addAssociation(name, parent.uri, child.uri);
                if (schema.childUriAttribute) {
                  child[schema.childUriAttribute] = parent.uri;
                }
                childIndex += 1;
              }
            }
            if (schema.share) {
              childIndex = 0;
            }
          });
        }
      }
    }
  });
}

function customize () {
  // add random VM utilization
  data.getItems('virtual-machines', true).forEach(function (item) {
    addUtilization(item);
  });
}

function initializeSettings () {
  var settings = {
    description: 'These are the configuration settings for an Ingot.',
    state: 'initial', // initial | updating | ready
    name: 'cluster PA 4',
    dataCenter: 'Palo Alto',
    version: '1.0',
    network: {
      ipV4Address: '192.168.2.10',
      ipV4Netmask: '255.255.255.0',
      ipV4Gateway: '192.168.2.1',
      dns1: '10.0.0.1',
      dns2: '10.0.0.2',
      ipV6Address: null
    },
    hypervisor: {
      type: 'vCenter',
      address: '192.168.2.11',
      userName: null,
      password: null,
      version: '5.0'
      // Transient fields
      // certificate:
      // trust:
    },
    ntpAddress: null,
    timeZone: null,
    locale: null,
    directory: {
      type: 'ldap',
      address: null,
      baseDn: null,
      groups: [] // {cn, dn, role}
      // Transient fields
      // userName:
      // password:
      // certificate:
      // trust:
    },
    nodes: [
      {
        name: 'cluster-pa-04-host-01',
        serialNumber: 'USX1234abcd',
        managed: false
        // Transient fails
        // address:
        // userName:
        // password:
      },
      {
        name: 'cluster-pa-04-host-02',
        serialNumber: 'USX1234efgh',
        managed: false
      }
    ],
    releaseNotes: 'http://ferret.grommet.io/release-notes',
    eula: 'http://ferret.grommet.io/eula',
    writtenOffer: 'http://ferret.grommet.io/written-offer'
  };
  data.setSettings(settings);
}

var steps = [
  createCategories,
  createResources,
  createActivity,
  createAssociations,
  customize,
  initializeSettings
];

function initialize () {
  data.setStatus({state: 'initializing', percent: 0});
  var index = 0;
  var timer = setInterval(function () {
    steps[index]();
    index += 1;
    if (index >= steps.length) {
      data.setStatus({state: 'initialized'});
      clearInterval(timer);
    } else {
      data.setStatus({state: 'initializing',
        percent: Math.floor((index / steps.length) * 100)});
    }
  }, INITIALIZE_STEP_INTERVAL);
}

function addUtilization (item) {
  // If the item came from the generator, copy attributes so each item has its own
  var attributes = item.attributes || {};
  if (item._indexAttributes) {
    attributes = JSON.parse(JSON.stringify(item._indexAttributes));
  }
  var size = item.size || attributes.size;
  if ('Online' === item.state) {
    attributes.cpuUtilization = random(100 - 0);
    attributes.cpuUsed = Math.round(size.vCpus *
      (attributes.cpuUtilization / 10.0)) / 10.0;
    attributes.memoryUtilization = random(100 - 0);
    attributes.memoryUsed = Math.round(size.memory *
      (attributes.memoryUtilization / 10.0)) / 10.0;
    if (! attributes.diskReads) {
      attributes.diskReads = historicalData(0, 100, 20); // kb per second over time
      attributes.diskWrites = historicalData(0, 100, 20); // kb per second over time
      attributes.networkPackets = historicalData(0, 100, 20); // packets over time
      attributes.networkThroughput = historicalData(0, 500, 20); // kb per second over time
    }
  } else {
    attributes.cpuUtilization = 0;
    attributes.cpuUsed = 0;
    attributes.memoryUtilization = 0;
    attributes.memoryUsed = 0;
  }
  attributes.diskUtilization = random(100 - 0);
  attributes.diskUsed = Math.round(size.diskSpace *
    (attributes.diskUtilization / 10.0)) / 10.0;
  if (! item.attributes) {
    item._indexAttributes = attributes;
    item._resourceAttributes = attributes;
  }
}

var Generator = {
  generate: initialize,
  addUtilization: addUtilization
};

module.exports = Generator;
