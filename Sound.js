// Ultra-Hipster IIFE
typeof function(window){

	// References to the 'private' data vars created in the Sound constructor.
	// Keyed by _guid.
	var storage = {};

	// Default settings for fx.
	var presets = {
		compressor: {
			default: {ratio: 12, threshold: -24, attack: .003, release: .025, knee: 30},
			mild: {ratio: 3, threshold: -18, attack: .003, release: .025, knee : 26},
			heavy: {ratio: 10, threshold: -24, attack: .008, release: .015, knee : 20},
			off: {ratio: 1, threshold: 0}
		}
	};
	
	// The Sound constructor.
	// Accepts a URL of the sound file to be created.
	// We use <audio> elements instead of XHR, so these can be cross-domain.
	//
	// All Sound methods that do not explicitly return a value 
	// will return `this` for chainability.
	window.Sound = function( url ){
	    var self = this, 
	        data = {}, 
	        guid = Date.now() + '_' + Math.floor( Math.random() * 0xFFFFFFFF ).toString(16);
	    this.__defineGetter__('_guid', function(){ return guid });
	    data.events = {};
	    data.url = url;
	    data.context = new webkitAudioContext();
	    data.compressorNode = data.context.createDynamicsCompressor();
	    data.panner = data.context.createPanner();
	    data.panner.panningModel = webkitAudioPannerNode.EQUALPOWER;
	    data.panner.setPosition(0,0,.1);
	    data.gainNode = data.context.createGainNode();
	    data.volumeNode = data.context.createGainNode();
	    data.analyser = data.context.createAnalyser();
	    data.analyser.smoothingTimeConstant = 0.5;
	    data.analyser.fftSize = 128;
	    data.processor = data.context.createJavaScriptNode(2048, 1, 1);
	    data.freqByteData = new Uint8Array(data.analyser.frequencyBinCount);
	    data.element = document.createElement('audio');
	    data.convolvers = {};
	    data.ready = false;
	    data.volume = 1;
	    data.element.src = data.url;
	    data.initCompressor = false;
	    data.element.addEventListener('canplaythrough', function(){
	        self.connect();
	    }, false);
	    data.processor.onaudioprocess = function(){
	        self.gainMeter();
	        self.compressionMeter();
	    };
	    storage[guid] = data;
	};
	
	// Utility for setting values.
	// Accepts a property name and the corresponding value, returns `this`.
	// Mostly for internal use, since useful properties like `volume`
	// have their own methods.
	//
	// Ex: Set the `trackName` property to 'Call Me Maybe'.
	// sound.set('trackName', 'Call Me Maybe');
	Sound.prototype.set = function( prop, val ){
	    if ( typeof prop === 'undefined' ) return this;
	    storage[this._guid][prop] = val;
	    return this;
	};
	
	// Utility for getting values.
	// Accepts a property name returns the value.
	// Mostly for internal use, since useful properties like `volume`
	// have their own methods.
	//
	// Ex: Get the `trackName` property.
	// sound.get('trackName'); // 'Call Me Maybe'
	Sound.prototype.get = function( prop ){
	    return storage[this._guid][prop];
	};
	
	// Event binding.
	// Accepts an event type and a callback function, returns `this`.
	//
	// Ex: Execute the provided callback when the `compression` event fires.
	// sound.on('compression', function(reduction){
	//     console.log( reduction );
	// });
	Sound.prototype.on = function( evt, func ){
	    this.get('events')[evt] = this.get('events')[evt] || [];
	    this.get('events')[evt].push( func );
	    return this;
	};
	
	// Event unbinding.
	// Accepts an event type and an optional callback function, returns `this`.
	//
	// If no function is provided, all events on the given type will be unbound,
	// otherwise only events whose callback === the passed function will be unbound.
	//
	// Ex: Unbind any `compression` event whose callback is `someFunction`.
	// sound.off('compression', someFunction);
	Sound.prototype.off = function( evt, func ){
	    var arr = [];
	    if ( !func )
	        this.get('events')[evt] = [];
	    else {
	        for ( var i = 0, l = this.get('events')[evt].length; i < l; i++ )
	            if ( this.get('events')[evt][i] !== func ) 
	                arr.push( this.get('events')[evt][i] );
	        this.get('events')[evt] = arr;
	    }
	    return this;
	};
	
	// Event triggering.
	// Accepts an event type, returns `this`.
	//
	// Ex: Manually trigger the `ready` event.
	// sound.trigger('ready');
	Sound.prototype.trigger = function( evt ){
	    var args = Array.prototype.slice.call(arguments, 1);
	    if ( !this.get('events')[evt] ) return;
	    for ( var i = 0, l = this.get('events')[evt].length; i < l;  i++ )
	        this.get('events')[evt][i].apply(this, args);
	    return this;
	};
	
	// Execute a callback when the track is playable.
	// Accepts a callback, returns `this`.
	//
	// If the track is ready at the time this method is called,
	// it will be executed immediately.
	//
	// Ex: Start playback when the track is ready.
	// sound.ready(function(){
	//     this.play();
	// });
	Sound.prototype.ready = function( func ){
		var self = this,  args = Array.prototype.slice.call(arguments, 1);
		if ( this.get('ready') ) 
			func.call( this, args );
		else 
			this.on('ready', function(){
				func.call( self, args );
			});
		return this;
	};
	
	// Connect the various gain nodes and analysers.
	//
	// This method is intended only for internal use,
	// and is called by the constructor.
	Sound.prototype.connect = function(){
	    this.set('source', this.get('context').createMediaElementSource( this.get('element') ));
	    this.get('source').connect( this.get('compressorNode') );
	    this.get('compressorNode').connect( this.get('panner') );
	    this.get('panner').connect( this.get('gainNode') );
	    this.get('gainNode').connect( this.get('volumeNode') );
	    this.get('volumeNode').connect( this.get('context').destination );
	    this.get('gainNode').connect( this.get('analyser') );
	    this.get('analyser').connect( this.get('processor') );
	    this.get('processor').connect( this.get('context').destination );
	    if ( !this.get('initCompressor') ) this.compressor('off');
	    this.set('ready', true);
	    this.trigger('ready');
	    return this;
	};
	
	
	// Begin playback.
	// Returns `this`.
	// If the track isn't ready, playback will be scheduled to begin
	// as soon as the `ready` event fires.
	//
	// Ex: Begin playback
	// sound.play();
	Sound.prototype.play = function(){
		var self = this;
	    if ( !this.get('ready') ){
	    	this.ready(function(){
	    		self.play();
	    	});
	    	return this;
    	}
	    this.get('element').play();
	    this.set('playing', true);
	    this.trigger('play');
	    return this;
	};
	
	// Pause playback.
	// Returns `this`.
	//
	// Ex: Pause playback
	// sound.pause();
	Sound.prototype.pause = function(){
	    this.get('element').pause();
	    this.set('playing', false);
	    this.trigger('pause');
	    return this;
	};
	
	// Toggle between play and pause.
	// A convenience so users don't have to heep track of state
	// or check sound.get('playing') == true.
	//
	// Ex: Toggle between play/pause.
	// sound.toggle();
	Sound.prototype.toggle = function(){
		this[this.get('playing') ? 'pause' : 'play']();
		return this;
	};
	
	// Getter/setter for playback position (in seconds)
	//
	// Ex: Set the playback position to 30.5 seconds.
	// sound.position(30.5); // returns `this`
	//
	// Ex: Get the current playback position.
	// sound.position(); // returns 30.5
	Sound.prototype.position = function( time ){
	    if ( typeof time === 'undefined' ) return this.get('element').currentTime;
	    this.get('element').currentTime = time;
	    this.trigger('seek', time);
	    return this;
	};
	
	// Getter/setter for track volume (from 0 to 1.5)
	// I'm artificially capping the range to prevent awful distortion.
	// If you don't like that, just change it.
	//
	// Ex: Set the volume to 0.8.
	// sound.volume(0.8); // returns `this`
	//
	// Ex: Get the current track volume.
	// sound.volume(); // returns 0.8
	Sound.prototype.volume = function( volume ){
	    if ( typeof volume === 'undefined' ) return this.get('volume');
	    volume = volume > 1.5 ? 1.5 : volume < 0 ? 0 : volume;
	    this.get('volumeNode').gain.value = volume;
	    this.set('volume', volume);
	    this.trigger('volume');
	    return this;
	}; 
	
	// Utility method for 'animations' or tweens. Really an internal thing.
	// Used for fades. Returns `this`.
	//
	// Ex: Just take a look at Sound.prototype.fade.
	Sound.prototype.animate = function( func, duration, callback ){
	   var times = [ Date.now() ], time = 0, i = 0, reqAnimFrame;
	   reqAnimFrame = (
	       window.requestAnimationFrame ||
	       window.mozRequestAnimationFrame ||
	       window.oRequestAnimationFrame ||
	       window.webkitRequestAnimationFrame );
	   reqAnimFrame(function loop(){
	        i = times.length;
	        times[i] = Date.now();
	        time = ( times[i] - times[0] );
	        if ( time < duration && func.call( times, time, i ) !== false )
	            reqAnimFrame( loop ); 
	        else if ( callback ) 
	            callback.call( times, time < duration ? time : isFinite( duration ) ? duration : time );
	    });
	    return this;
	};
	
	// Fade from one volume level to another.
	// Accepts a start volume, end volume, duration (in ms), and an optional callback.
	// Returns `this`.
	//
	// Ex: Fade from 1 to 0 over a 5 second period.
	// sound.fade(1, 0, 5000, function(){
	//     sound.pause();
	// });
	Sound.prototype.fade = function( start, end, duration, callback ){
	    var self = this;
	    this.animate(function( elapsed ){
	        var progress = elapsed / duration;
	        self.volume( start + ( end - start ) * progress );
	    },
	    duration,
	    function(){
	        self.volume(end);
	        if ( typeof callback === 'function' ) callback.call(self);
	    });
	    return this;
	};
	
	// Fade from the current track volume level to another.
	// Accepts an end volume, duration (in ms), and an optional callback.
	// Returns `this`.
	//
	// Ex: Fade from the current volume to 0 over a 3 second period.
	// sound.fadeTo(0, 3000, function(){
	//     sound.pause();
	// });
	Sound.prototype.fadeTo = function( end, duration, callback ){
	    this.fade( this.volume(), end, duration, callback );
	    return this;
	};
	
	// Fade from the current track volume level to 0.
	// Accepts a duration (in ms), and an optional callback.
	// Returns `this`.
	//
	// Ex: Fade out from the current volume over an 8 second period.
	// sound.fadeOut(8000, function(){
	//     sound.pause();
	// });
	Sound.prototype.fadeOut = function( duration, callback ){
	    this.fadeTo( 0, duration, callback );
	    return this;
	};
	
	// Tremolo effect.
	// Accepts a speed (in ms) and an intensity value (from 0 to 1).
	// Call it with no arguments to turn tremolo off.
	//
	// Ex: 150ms tremolo with medium intensity.
	// sound.tremolo(150, 0.5); // returns `this`
	//
	// Ex: Turn off the tremolo effect.
	// sound.tremolo(); // returns `this`
	Sound.prototype.tremolo = function( speed, intensity ){
	    var self = this, tremolo, down, up;
	    if ( this.get('currentTremolo') ) this.get('currentTremolo').kill();
	    if ( !speed ) return this;
	    speed = speed / 2;
	    intensity = typeof intensity === 'undefined' ? .5 : intensity;
	    this.set('currentTremolo', {
	        down : function(){
	            self.animate(function( elapsed ){
	            	var progress = elapsed / speed;
	            	self.get('gainNode').gain.value = 1 - ( intensity * progress );
	            }, 
	            speed,
	            function(){
	            	self.get('gainNode').gain.value = 1 - intensity;
	            	self.get('currentTremolo').up();
	            });
	        },
	        up : function(){
	        	self.animate(function( elapsed ){
	        		var progress = elapsed / speed;
	        		self.get('gainNode').gain.value = 1 - ( intensity * ( 1 - progress ) );
	        	}, 
	        	speed,
	        	function(){
	        		self.get('gainNode').gain.value = 1;
	        		self.get('currentTremolo').down();
	        	});
	        },
	        kill : function(){
	            self.get('currentTremolo').down = function(){};
	            self.up();
	        }
	    });
	    this.get('currentTremolo').down();
	    return this;
	};
	
	// Dynamics compression
	//
	// Ex: Set the threshold of the compressor to -24.
	// sound.compressor('threshold', 24); // returns `this`.
	//
	// Ex: Get the threshold of the compressor
	// sound.compressor('threshold'); // returns -24.
	//
	// Ex: Set multiple compressor properties.
	// sound.compressor({ratio: 4, threshold: 24, knee: 6}); // returns `this`.
	//
	// Ex: Set the compressor using a preset.
	// sound.compressor('default'); //returns `this`. 
	//
	// Ex: Turn the compressor off. 
	// sound.compressor('off'); // returns `this`.
	//
	// Compressors are initialized with a ratio of 1 and a threshold of zero,
	// which means it's off. Both values need to be set for the compressor to function.
	Sound.prototype.compressor = function( param, val ){
	    if ( !param ) {
	        this.get('compressorNode').threshold.value = 0;
	        return this;
	    }
	    if ( typeof val === 'undefined' && typeof param === 'string' && param !== 'reduction' ){
	    	param = presets.compressor[param] || undefined;
	    }
	    if ( typeof param === 'object' )
	        for ( var key in param )
	            this.compressor(key, param[key]);
	    switch ( param ){
	    	// The speed with which the compressor begins attenuating
	    	// once the signal has risen above the threshold.
	    	// Measured in seconds, ranging from 0 to 1.
	    	// Default (in Chrome) is .003.
	        case 'attack':
	            if ( typeof val === 'undefined' ) return this.get('compressorNode').attack.value;
	            this.get('compressorNode').attack.value = val;
	            break;
	        // The speed with which the compressor stops attenuating
	        // once the signal has fallen below the threshold.
	        // Measured in seconds, ranging from 0 to 1.
	        // Default (in Chrome) is .025.
	        case 'release':
	            if ( typeof val === 'undefined') return this.get('compressorNode').release.value;
	            this.get('compressorNode').release.value = val;
	            break;
	        // The level at which the compressor will begin attenuating.
	        // Measured in dB, ranging from 0 to -100.
	        // Default (in Chrome) is -24.
	        case 'threshold':
	            if ( typeof val === 'undefined') return this.get('compressorNode').threshold.value;
	            this.get('compressorNode').threshold.value = this.get('_threshold');
	            break;
	        // The ratio at which signals above the threshold will be attenuated.
	        // Ranges from 1 to 22.
	        // Default (in Chrome) is 12, which is pretty fucking high if you ask me.
	        case 'ratio':
	            if ( typeof val === 'undefined') return this.get('compressorNode').ratio.value;
	            this.get('compressorNode').ratio.value = val;
	            break;
	        // The point above the threshold where the curve transitions to the ratio.
	        // Measured in decibels, from 0 to 40.
	        // Default (in Chrome) is 30, which, again, seems pretty high.
	        case 'knee':
	            if ( typeof val === 'undefined') return this.get('compressorNode').knee.value;
	            this.get('compressorNode').knee.value = val;
	            break;
	        // Read-only. The number of decibels of reduction.
	        case 'reduction':
	            return this.get('compressorNode').reduction.value;
	    }
	    if ( !this.get('initCompressor') ) this.set('initCompressor', true);
	    return this;
	};
	
	// Create a new convolver (think "reverb")
	// Accepts an effect name (must be unique), a url to the impulse response,
	// an optional gain value (from 0 to 1) for the effect, and an optional callback. Returns `this`.
	//
	// It makes zero sense to use <audio> elements for a convolver node,
	// so this method uses AJAX. Because of that, your impulse response
	// must be on the same domain as your page.
	//
	// Ex: create a new reverb effect named `plate` and set its gain to 0.4.
	// sound.addConvolver('plate', 'plate.wav', 0.8);
	//
	// Ex: Add a new convolver, and begin playback when it's loaded.
	// sound.addConvonvolver('plate', 'plate.wav', 0.7, function(){
	//     this.play();
	// });
    //
    // Note: all convolvers are initiialized with a gain of 0 unless you explicitly
    // pass a value.
	Sound.prototype.addConvolver = function( name, url, gain, callback ){
	    var self = this, request = new XMLHttpRequest();
	    if ( this.get('convolvers')[name] ) return this;
	    callback = callback ? callback : typeof gain === 'function' ? gain : undefined;
	    gain = typeof gain !== 'function' ? gain : undefined;
	    this.get('convolvers')[name] = {};
	    this.get('convolvers')[name].gainNode = this.get('context').createGainNode();
	    this.get('convolvers')[name].gainNode.connect(this.get('context').destination);
	    this.get('convolvers')[name].convolver = this.get('context').createConvolver();
	    this.get('convolvers')[name].convolver.connect(this.get('convolvers')[name].gainNode);
	    this.get('convolvers')[name].gain = function( gain ){
	    	if ( typeof gain === 'undefined' ) return this.gainNode.gain.value;
	    	gain = gain > 1 ? 1 : gain < 0 ? 0 : gain;
	    	this.gainNode.gain.value = gain;
	    	return self;
	    };
	    this.get('convolvers')[name].gain( gain || 0 );
	    request.open('GET', url, true);
	    request.responseType = 'arraybuffer';
	    request.addEventListener('load', function(){
	        self.get('context').decodeAudioData(request.response, function(buffer){
	            var connect = function(){
	            	self.get('volumeNode').connect(self.get('convolvers')[name].convolver);
	            	self.get('convolvers')[name].convolver.buffer = buffer;
	            	self.get('convolvers')[name].ready = true;
	            	self.trigger('fxLoaded', name);
	            	if ( typeof callback == 'function' ) callback.call( self );
	            };
	            if ( self.get('ready') ) connect();
	            else self.on('ready', connect);
	        });
	    }, false);
	    request.send();
	    return this;
	};
	
	// Getter / setter for convolver gain.
	// Accepts an effect name and a gain value (from 0 to 1).
	//
	// Ex: Set the gain of the `plate` convolver to 0.9.
	// sound.convolverGain('plate', 0.9); // returns `this`
	//
	// Ex: Get the current gain of the `plate` convolver.
	// sound.convolverGain('plate'); // returns 0.9
	Sound.prototype.convolverGain = function( name, gain ){
		if ( !this.get('convolvers')[name] ) return this;
		return this.get('convolvers')[name].gain.call( this.get('convolvers')[name], gain );
	};
	
	// Triggers the `compression` event and passes the amount of gain
	// reduction in dB. Returns `this`.
	//
	// Don't call this method. Seriously. It won't help you.
	// But you can use its output like this:
	//
	// sound.on('compression', function( reduction ){
	//     console.log('Gain reduced by ' + reduction + 'dB');
	// });
	Sound.prototype.compressionMeter = function(){
	    this.trigger('compression', this.compressor('reduction'));
	    return this;
	};
	
	// Triggers the `averagevolume` event and passes
	// my hacky attempt at figuring out the current output
	// volume of the track. Need to talk to a real engineer
	// and figure this out for real. Good enough for now thos.
	//
	// Don't call this method. Seriously. It won't help you.
	// But you can use its output like this:
	//
	// sound.on('averagevolume', function( volume ){
	//     console.log(volume);
	// });
	Sound.prototype.gainMeter = function(){
	    var values = 0, average, length = this.get('freqByteData').length;
	    this.get('analyser').getByteFrequencyData( this.get('freqByteData') );
	    for ( var i = 0; i < length; i++ )
	        values += this.get('freqByteData')[i];
	    average = ( values / length ) * this.volume();
	    this.trigger('averagevolume', average);
	    return this;
	};

}(this);