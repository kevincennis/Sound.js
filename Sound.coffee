storage = {}

presets = 
	compressor :
		default :
			ratio: 12
			threshold: -24
			attack: .003
			release: .025
			knee: 30
		mild :
			ratio: 3
			threshold: -18
			attack: .003
			release: .025
			knee: 26
		heavy :
			ratio: 10
			threshold: -24
			attack: .008
			release: .015
			knee: 20
		off :
			ratio: 1
			threshold: 0

class window.Sound

	constructor : ( url ) ->
		data = {}
		guid = Date.now() + '_' + Math.floor( Math.random() * 0xFFFFFFFF ).toString(16)
		@__defineGetter__ '_guid', () -> return guid
		data.events = {}
		data.url = url
		data.context = new webkitAudioContext()
		data.compressorNode = data.context.createDynamicsCompressor()
		data.panner = data.context.createPanner()
		data.panner.panningModel = webkitAudioPannerNode.EQUALPOWER;
		data.panner.setPosition 0, 0, .1
		data.gainNode = data.context.createGainNode()
		data.volumeNode = data.context.createGainNode()
		data.analyser = data.context.createAnalyser()
		data.analyser.smoothingTimeConstant = 0.5
		data.analyser.fftSize = 128
		data.processor = data.context.createJavaScriptNode 2048, 1, 1
		data.freqByteData = new Uint8Array data.analyser.frequencyBinCount
		data.element = document.createElement 'audio'
		data.convolvers = {}
		data.ready = false
		data.volume = 1
		data.element.src = data.url
		data.initCompressor = false
		data.element.addEventListener('canplaythrough', () => 
			@connect()
		, false)
		data.processor.onaudioprocess = () =>
			@gainMeter()
			@compressionMeter()
		storage[guid] = data

	set : ( prop, val ) ->
		return @ if !prop?
		storage[@_guid][prop] = val;
		return @

	get : ( prop ) ->
		storage[@_guid][prop];

	on : ( evt, func ) ->
		@get('events')[evt] = @get('events')[evt] or [];
		@get('events')[evt].push( func );
		return @

	off : ( evt, func ) ->
		if func?
			arr.push fn for fn in @get('events')[evt] when fn isnt func
		else
			arr = []
		@get('events')[evt] = arr
		return @

	trigger : ( evt ) ->
		args = Array.prototype.slice.call arguments, 1
		return @ if !this.get('events')[evt]?
		callback.apply @, args for callback in @get('events')[evt]
		return @

	ready : ( func ) ->
		args = Array.prototype.slice.call arguments, 1
		if @get('ready')
			func.call @, args
		else
			@on 'ready', () =>
				func.call @, args
		return @

	connect : () ->
		@set('source', @get('context').createMediaElementSource( @get('element') ))
		@get('source').connect( @get('compressorNode') )
		@get('compressorNode').connect( @get('panner') )
		@get('panner').connect( @get('gainNode') )
		@get('gainNode').connect( @get('volumeNode') )
		@get('volumeNode').connect( @get('context').destination )
		@get('gainNode').connect( @get('analyser') )
		@get('analyser').connect( @get('processor') )
		@get('processor').connect( @get('context').destination )
		@compressor('off') if !@get('initCompressor')
		@set('ready', true)
		@trigger('ready')

	play : () ->
		if !@get('ready')
			this.ready( () =>
				@play()
			)
			return @
		@get('element').play()
		@set('playing', true)
		@trigger('play')

	pause : () ->
		@get('element').pause()
		@set('playing', false)
		@trigger 'pause'

	toggle : () ->
		@[ if @get('playing') then 'pause' else 'play']()

	position : ( time ) ->
		return @get('element').currentTime if !time?
		@get('element').currentTime = time
		@trigger('seek', time)

	volume : ( volume ) ->
		return @get('volume') if !volume?
		volume = if volume > 1.5 then 1.5 else if volume < 0 then 0 else volume
		@get('volumeNode').gain.value = volume
		@set 'volume', volume
		@trigger 'volume'

	animate : ( func, duration, callback ) ->
		times = [ Date.now() ]
		reqAnimFrame = 
			window.requestAnimationFrame or 
			window.mozRequestAnimationFrame or 
			window.oRequestAnimationFrame or 
			window.webkitRequestAnimationFrame
		looper = () ->
			i = times.length
			times[i] = Date.now()
			time = ( times[i] - times[0] )
			if time < duration and !!func.call( times, time, i )
				reqAnimFrame( looper )
			else 
				callback.call( @ )
		reqAnimFrame( looper )
		return @

	fade : ( start, end, duration, callback ) ->
		@animate( ( elapsed ) =>
			progress = elapsed / duration
			@volume  start + ( end - start ) * progress
		duration
		() =>
			@volume end
			callback.call(@) if typeof callback == 'function'
		)
		return @;

	fadeTo : ( end, duration, callback ) ->
		@fade @volume(), end, duration, callback

	fadeOut : ( duration, callback ) ->
		@fadeTo 0, duration, callback

	tremolo : ( speed, intensity ) ->
		@get('currentTremolo').kill() if @get('currentTremolo')?
		return @ if !speed
		speed = speed / 2
		intensity = if intensity? then .5 else intensity
		@set('currentTremolo',
			down : () =>
				@animate( ( elapsed ) =>
					progress = elapsed / speed
					@get('gainNode').gain.value = 1 - ( intensity * progress )
				,
				speed,
				() =>
					@get('gainNode').gain.value = 1 - intensity
					@get('currentTremolo').up()
				)
			up : () =>
				@animate( ( elapsed ) =>
					progress = elapsed / speed
					@get('gainNode').gain.value = 1 - ( intensity * ( 1 - progress ) )
				,
				speed,
				() =>
					@get('gainNode').gain.value = 1;
					@get('currentTremolo').down();
				)
			kill : () =>
				@get('currentTremolo').down = () ->
				@up()
		)
		@get('currentTremolo').down()
		return @

	compressor : ( param, val ) ->
		return @ if !param?
		if !val? and typeof param == 'string' and param != 'reduction'
			param = presets.compressor[param] or undefined
		if typeof param == 'object'
			@compressor( key, value ) for key, value of param
		switch param
			when 'attack'
				return @get('compressorNode').attack.value if !val?
				@get('compressorNode').attack.value = val
			when 'release'
				return @get('compressorNode').release.value if !val?
				@get('compressorNode').release.value = val
			when 'threshold'
				return @get('compressorNode').threshold.value if !val?
				@get('compressorNode').threshold.value = val
			when 'ratio'
				return @get('compressorNode').ratio.value if !val?
				@get('compressorNode').ratio.value = val
			when 'knee'
				return @get('compressorNode').knee.value if !val?
				@get('compressorNode').knee.value = val
			when 'reduction'
				return @get('compressorNode').reduction.value
		@set 'initCompressor', true if !@get('initCompressor')
		return @

	addConvolver : ( name, url, gain, callback ) ->
		request = new XMLHttpRequest()
		return @ if @get('convolvers')[name]?
		callback  = if callback then callback else if typeof gain == 'function' then gain else undefined
		gain = if typeof gain != 'function' then gain else undefined
		@get('convolvers')[name] = {}
		@get('convolvers')[name].gainNode = @get('context').createGainNode()
		@get('convolvers')[name].gainNode.connect @get('context').destination
		@get('convolvers')[name].convolver = @get('context').createConvolver()
		@get('convolvers')[name].convolver.connect @get('convolvers')[name].gainNode
		@get('convolvers')[name].gain = ( gain ) ->
			return @gainNode.gain.value if !gain?
			gain = if gain > 1 then 1 else if gain < 0 then 0 else gain
			@gainNode.gain.value = gain
		@get('convolvers')[name].gain gain or 0
		request.open 'GET', url, true
		request.responseType = 'arraybuffer'
		request.addEventListener 'load', () =>
			@get('context').decodeAudioData request.response, (buffer) =>
				connect = () =>
					@get('volumeNode').connect @get('convolvers')[name].convolver
					@get('convolvers')[name].convolver.buffer = buffer
					@get('convolvers')[name].ready = true
					@trigger 'fxLoaded', name
					callback.call( @ ) if typeof callback == 'function'
				if @get 'ready'
					connect()
				else 
					@on 'ready', connect
		, false
		request.send()
		return @

	convolverGain : ( name, gain ) ->
		@get('convolvers')[name].gain @get('convolvers')[name], gain if @get('convolvers')[name]?
		return @

	compressionMeter : () ->
		@trigger 'compression', @compressor 'reduction'

	gainMeter : () ->
		values = 0
		length = @get('freqByteData').length
		@get('analyser').getByteFrequencyData( @get 'freqByteData' )
		values += val for val in @get 'freqByteData'
		average = ( values / length ) * @volume()
		@trigger 'averagevolume', average