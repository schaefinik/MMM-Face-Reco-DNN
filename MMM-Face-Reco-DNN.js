/* Magic Mirror
 * Module: MMM-Face-Reco-DNN
 *
 * By Thierry Nischelwitzer http://nischi.ch
 * MIT Licensed.
 */

'use strict';

Module.register('MMM-Face-Reco-DNN', {
  defaults: {
    // Logout 15 seconds after user was not detecte anymore, if they will be detected between this 15
    // Seconds, they delay will start again
    logoutDelay: 15000,
    // How many time the recognition starts, with a RasPi 3+ it would be good every 2 seconds
    checkInterval: 2000,
    // Module set used for when there is no face detected ie no one is in front of the camera
    noFaceClass: 'noface',
    // Module set used for when there is an unknown/unrecognised face detected 
    unknownClass: 'unknown',
    // Module set used for when there is a known/recognised face detected 
    knownClass: 'known',
    // Module set used for strangers and if no user is detected
    defaultClass: 'default',
    // Set of modules which should be shown for any user ie when there is any face detected
    everyoneClass: 'everyone',
    // Set of modules that are always shown - show if there is a face or no face detected
    alwaysClass: 'always',
    // xml to recognize with haarcascae
    cascade:
      'modules/MMM-Face-Reco-DNN/tools/haarcascade_frontalface_default.xml',
    // pre encoded pickle with the faces
    encodings: 'modules/MMM-Face-Reco-DNN/tools/encodings.pickle',
    // You wanna use pi camera or usb / builtin (1 = raspi camera, 0 = other camera)
    usePiCamera: 1,
    // if you don't use the pi camera, which stream do you want to use
    source: 0,
    // rotate camera?
    rotateCamera: 0,
    // method of face recognition (dnn = deep neural network, haar = haarcascade)
    method: 'dnn',
    // which face detection model to use. "hog" is less accurate but faster on CPUs. "cnn" is a more accurate
    // deep-learning model which is GPU/CUDA accelerated (if available). The default is "hog".
    detectionMethod: 'hog',
    // how fast in ms should the modules hide and show (face effect)
    animationSpeed: 0,
    // Path to Python to run the face recognition (null / '' means default path)
    pythonPath: null,
    // Boolean to toggle welcomeMessage
    welcomeMessage: true,
    // Save some pictures from recognized people, if unknown we save it in folder "unknown"
    // So you can extend your dataset and retrain it afterwards for better recognitions
    extendDataset: false,
    // if extenDataset is set, you need to set the full path of the dataset
    dataset: 'modules/MMM-Face-Reco-DNN/dataset/',
    // How much distance between faces to consider it a match. Lower is more strict.
    tolerance: 0.6,
    // allow multiple concurrent user logins, 0=no, any other number is the maximum number of concurrent logins
    multiUser: 0,
    // turn on extra debugging 0=no, 1=yes
    debug: 0,
    
  },

  timouts: {},
  users: [],
  userClasses: [],

  // ----------------------------------------------------------------------------------------------------
  start: function() {
    this.sendSocketNotification('CONFIG', this.config);
    Log.log('Starting module: ' + this.name);

    this.config.debug && Log.log(this.config);

    // there are 3 states (noface, unknown face, known face). Each of these has classes that allow them
    // this configuration defines which classes provide which states
    this.config.classes_noface =[this.config.noFaceClass, this.config.defaultClass,                           this.config.alwaysClass];
    this.config.classes_unknown=[this.config.unknownClass,this.config.defaultClass, this.config.everyoneClass,this.config.alwaysClass];
    this.config.classes_known  =[this.config.knownClass,                            this.config.everyoneClass,this.config.alwaysClass];

  },

  // ----------------------------------------------------------------------------------------------------
  // Define required translations.
  getTranslations: function() {
    return {
      en: 'translations/en.json',
      de: 'translations/de.json',
      es: 'translations/es.json',
      zh: 'translations/zh.json',
      nl: 'translations/nl.json',
      sv: 'translations/sv.json',
      fr: 'translations/fr.json',
      id: 'translations/id.json',
      it: 'translations/it.json',
      bg: 'translations/bg.json',
      ru: 'translations/ru.json',
      nb: 'translations/nb.json',
    };
  },

----------------------------------------------------------------------------------------------------
  login_user: function(name) {
    this.sendNotification("CURRENT_PROFILE", name);
},
  // ----------------------------------------------------------------------------------------------------
  logout_user: function(name) {
    this.sendNotification("CURRENT_PROFILE", "default");
  },
    
  // ----------------------------------------------------------------------------------------------------
  get_class_set: function(userClasses) {
    // function to take all the classes from logged in users and work out the total set (no duplicates) of the classes
    var self = this;

    // all the classes from all the logged in users are in this.userClasses like
    // this.userClasses[user1]=array of classes
    // this.userClasses[user2]=array of classes
    // etc
    
    var classList=[];
    var finalClasses=[];
    
    Object.values(userClasses).forEach(function(classes) {
      // classes is an array of classes for a user
      classes.forEach(val=>classList[val]=1);      
    });

    // classList should now have a unique list of the classes as properties
    Object.keys(classList).forEach(function(val) {
      // val is a string which is the name of a class
      finalClasses.push(val);
    });
    
    return finalClasses;
  },
  // ----------------------------------------------------------------------------------------------------
  show_modules: function(showClasses,exceptClasses) {
    // show modules with "showClasses" except for those with "exceptClasses"
    var self = this;
    this.config.debug && Log.log('Showing all new classes:' + showClasses + ', except old classes:' + exceptClasses);
    MM.getModules()
      .withClass(showClasses)
      .exceptWithClass(exceptClasses)
      .enumerate(function(module) {
       module.show(
         self.config.animationSpeed,
         function() {
           Log.log(module.name + ' is shown.');
         },
         {
           lockString: self.identifier,
         }
       );
      });
  },
  // ----------------------------------------------------------------------------------------------------
  hide_modules: function(hideClasses,exceptClasses) {
    // hide modules with "hideClasses" except for those with "exceptClasses"
    var self = this;
    // there must be a fancier javascript way to do this if with just runs that same getModules code but with different collections of selectors
    // look to fix this later
    if (hideClasses===0) {
      this.config.debug && Log.log('Hiding all classes except new classes:' + exceptClasses);
      MM.getModules()
       .exceptWithClass(exceptClasses)
       .enumerate(function(module) {
         module.hide(
           self.config.animationSpeed,
           function() {
             Log.log(module.name + ' is hidden.');
           },
           {
             lockString: self.identifier,
           }
         );
       });
    } else if (exceptClasses===0) {
      this.config.debug && Log.log('Hiding old classes:' + hideClasses);
      MM.getModules()
       .withClass(hideClasses)
       .enumerate(function(module) {
         module.hide(
           self.config.animationSpeed,
           function() {
             Log.log(module.name + ' is hidden.');
           },
           {
             lockString: self.identifier,
           }
         );
       });
    } else {
      this.config.debug && Log.log('Hiding all old classes:' + hideClasses + ', except new classes:' + exceptClasses);
      MM.getModules()
       .withClass(hideClasses)
       .exceptWithClass(exceptClasses)
       .enumerate(function(module) {
         module.hide(
           self.config.animationSpeed,
           function() {
             Log.log(module.name + ' is hidden.');
           },
           {
             lockString: self.identifier,
           }
         );
       });
    }
    
    
  },
  // ----------------------------------------------------------------------------------------------------
  socketNotificationReceived: function(notification, payload) {
    var self = this;
    var user;

    // somebody has logged in
    if (payload.action === 'login') {
      var loginCount=0;
      for (user of payload.users) {
        if (user != null) {
          
          // if there are currently no users logged in OR we allow multiple users
          this.config.debug && Log.log('Number of logged in users:' + this.users.length + ', Allowed Number of Users:' + this.config.multiUser);
          if (this.users.length === 0 || this.users.length < this.config.multiUser) {
            // check if the user is already logged in
            if (!this.users.includes(user)) {
              // run the login procedure
              this.login_user(user);
              // increment the counter
              loginCount++;
            } else {
              this.config.debug && Log.log('Detected ' + user + ' again.');
            }
          } else {
            this.config.debug && Log.log('Detected a login event for ' + user + ' but multiple concurrent logins is limited to ' + this.config.multiUser +  ' and ' + this.users + ' is already logged in.');
          }

          // clear any timeouts the user might have so that they stay logged in
          if (this.timouts[user] != null) {
            this.config.debug && Log.log('Clearing timeouts for ' + user);
            this.config.debug && Log.log('Remaining timeouts BEFORE:')
            this.config.debug && Log.log(this.timouts);
            clearTimeout(this.timouts[user]);
            this.config.debug && Log.log('Remaining timeouts AFTER:')
            this.config.debug && Log.log(this.timouts);
          }
        }
      }

      if (loginCount>0) {
         // We still need to broadcast MM notification for backward compatability.
         this.config.debug && Log.log('Detected ' + loginCount + ' logins.');
         this.sendNotification('USERS_LOGIN', payload.users);
      }
    } else if (payload.action === 'logout') {
      var logoutCount=0;
      for (user of payload.users) {
        if (user != null) {
          // see if user is even logged in, since you can only log out if you are actually logged in
          if (this.users.includes(user)) {
            this.config.debug && Log.log('Setting logout timer for ' + user + ' for ' + this.config.logoutDelay + 'ms');
            this.timouts[user] = setTimeout(function() {
        
              // Broadcast notificaiton that we are about to hide modules.
              // Ideally this would be USERS_LOGOUT to be consistent with hide/show timer, but to prevent regression using a new type.
              self.sendNotification('USERS_LOGOUT_MODULES', user);
              self.logout_user(user);
              logoutCount++;
            }, this.config.logoutDelay);
          } else {
            this.config.debug && Log.log('Detected a logout event for ' + user + ' but they were not logged in.');
          }
        }
      }

      if (logoutCount>0) {
         this.config.debug && Log.log('Detected ' + logoutCount + ' logouts.');
         this.sendNotification('USERS_LOGOUT', payload.users);
      }
    }
  },

  // ----------------------------------------------------------------------------------------------------
  notificationReceived: function(notification, payload, sender) {
    var self = this;

    // Event if DOM is created
    if (notification === 'DOM_OBJECTS_CREATED') {
      // at startup modules will already be shown
      // we want to hide modules (by class) that are not supposed to be shown
      // in this case we want to hide any class except those which bring us to the noface state
      // this list of classes is contained in this.classes_noface
      this.hide_modules(0,this.config.classes_noface);
    }

    // load logged in users
    if (notification === 'GET_LOGGED_IN_USERS') {
      Log.log(this.name + ' get logged in users ' + this.users);
      this.sendNotification('LOGGED_IN_USERS', this.users);
    }
  },
});
