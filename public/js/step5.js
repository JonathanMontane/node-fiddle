var storage = function(){
  var _rows = [];
  var _updateCallback = function(){};
  this.rows = function(d){
    if(arguments.length){
      _rows = d;
      _updateCallback(_rows);
      return this;
    } else {
      return _rows;
    }
  }
  this.on = function(keyword, callback){
    if(keyword === "update") {
      _updateCallback = callback;
      return this;
    }
  }
};

var countrystore = new storage(),
    datastore = new storage();

var base_f, granular_f;
var country_f;
var base_filters;
var granular_filters;

var map_view, barchart_view;

var feature;
var bubble;
var chart;

//FILTER code
function update_base_filters(data){
  base_filters = d3.keys(data[0]);
  d3.select("#base-filter")
    .selectAll('option')
      .data(base_filters)
    .enter().append('option')
      .attr('value', function(d){return d;})
      .text(function(d){return d;});

  base_f = base_filters[0];
  update_granular_filter(datastore.rows(), base_f);

  d3.select("#base-filter").on('change', function(){
    base_f = this.options[this.selectedIndex].value;
    update_granular_filter(datastore.rows(), base_f);
  });
}

function update_granular_filter(data, base_filter){
  var granular_data ={};
  data.forEach(function(d){ return granular_data[d[base_filter]] = undefined});

  granular_filters = d3.keys(granular_data);
  granular_filters.unshift('None');


  var g_filter = d3.select("#granular-filter")
    .selectAll('option')
      .data(granular_filters);
  g_filter
      .attr('value', function(d){ return d;})
      .text(function(d){ return d;})
    .enter().append('option')
      .attr('value', function(d){ return d;})
      .text(function(d){ return d;});

  g_filter.exit().remove();

  granular_f = granular_filters[0];
  update_views(base_f, granular_f, country_f, data, false);

  d3.select("#granular-filter").on('change', function(){
    granular_f = this.options[this.selectedIndex].value;
    update_views(base_f, granular_f, country_f, data, true);
  });
}

//Here is where the computation of each views of the data is done.
//When adding a new filter or a new view, this is the function that needs to be updated.
//The usability could be slightly improved by moving all the *_f into an {} and passing it
//to the function as such. (No need to update all the occurences of the function after each
//addition of a filter.
function update_views(base_f, granular_f, country_f, data, propagate){
  var map_data = {};
  var keywords_data = {}

  data.forEach(function(d){
    //The filter function
    if((granular_f === 'None' || d[base_f] === granular_f) && (country_f === undefined || d["country"] === country_f)){
      map_data[d["country"]] = (map_data[d["country"]]||0) + (parseInt(d["searches"])||0);
      if(!keywords_data[d["keyword"]]) keywords_data[d["keyword"]] = [];
      keywords_data[d["keyword"]].push(d["cpc_usd"]);
    }
  });

  var _keyword_pairs = calculate_cpc(keywords_data);  
  _keyword_pairs = _keyword_pairs.sort(function(a,b){return d3.descending(a[1], b[1])}).slice(0,5);

  map_view = map_data;
  barchart_view = _keyword_pairs;

  if(propagate === true){
    update_map(map_data);
    update_barchart(barchart_view);
  }
}

function calculate_cpc(keywords){
  var _keyword_pairs = [];
  for(var keyword in keywords){
    if(keywords.hasOwnProperty(keyword)){
      var val = keywords[keyword]
        .filter(function(d){return d != "";})
        .reduce(function(prev, current, index, filtered_keywords){
          if(index === filtered_keywords.length-1) return (parseFloat(prev)+parseFloat(current))/(index+1);
          return parseFloat(prev)+parseFloat(current);
        },0);
      _keyword_pairs.push([keyword,val]);
    }
  }
  return _keyword_pairs;
}

//MAP Code
var viewbox_width = 1280, viewbox_height = 800;

var projection = d3.geo.mercator()
    .scale(10000)
    .translate([400,2000]);


var path = d3.geo.path()
    .projection(projection);

var svg = d3.select("#map").append("svg:svg")
    .attr("viewBox", "0 0 "+ viewbox_width +" "+ viewbox_height)
    .attr("preserveAspectRatio","xMidYMid meet");

function clip(d) {
  return path(d);
}

function create_map(store){
  feature = svg.selectAll("path")
      .data(store.rows().features);
  feature.enter().append("svg:path")
      .attr("d", clip);

  feature.append("svg:title")
      .text(function(d) { return d.properties.name; });

  bubble = svg.selectAll("circle")
    .data(store.rows().features.filter(function(d){return d['searches'] ? true : false;}))
        .attr("transform", function(d){
          if(d.id === "FRA") return "translate(470,520)"; //forced centroid (bc Guyane and stuff)
          return "translate("+path.centroid(d)+")";
        })
        .attr("r", function(d){
          return (Math.sqrt(d["searches"])/100+10)||0;
        })
        .style("fill","f00");
  bubble.enter().append("svg:circle")
        .attr("transform", function(d){
          if(d.id === "FRA") return "translate(470,520)"; //forced centroid (bc Guyane and stuff)
          return "translate("+path.centroid(d)+")";
        })
        .attr("r", function(d){
          return (Math.sqrt(d["searches"])/100+10)||0;
        })
        .style("fill","f00");

  bubble.append("svg:title")
      .text(function(d) { return parseInt(d["searches"]/100000)/10+"M searches"; });

  bubble.on('click', function(d){
    console.log("someone clicked me!", d);
    if(country_f !== d['id']){
      country_f = d['id'];
    } else {
      country_f = undefined;
    }
    update_views(base_f, granular_f, country_f, datastore.rows(), true);
  })

}

function update_map(data){
  countrystore.rows().features.forEach(function(d){
    if(d["searches"]) d["searches"] = 0;
    for(var key in data){
      if(data.hasOwnProperty(key)){
        if(d.id === key){
          d["searches"] = data[key];
        }
      }
    }
  });

  bubble
    .html(function(d){return "<title>"+parseInt(d["searches"]/100000)/10+"M searches"+"</title>";})
    .transition(750)
      .attr("r", function(d){
        return (Math.sqrt(d["searches"])/100+10)||0;
       });
}

//BARCHART code
var x = d3.scale.linear()
    .range([0, 420]);

function create_barchart(data){
  chart = d3.select("#chart")
    .selectAll("div")
      .data(data)
    .enter().append("div")
      .style("width", function(d) { return x(d[1]) + "px"; })
      .text(function(d) { return d[0]+" : "+parseInt(d[1]*100)/100 + "$"; });

}

function update_barchart(data){
   x.domain([0, data[0][1]]);
   chart.data(data)
     .transition(750)
      .style("width", function(d) { return x(d[1]) + "px"; })
      .text(function(d) { return d[0]+" : "+parseInt(d[1]*100)/100 + "$"; });
}



//DATA code
d3.csv("/step5/base_data.csv", function(rows){
  datastore.rows(rows);
  update_base_filters(rows);
  d3.json("/step5/world-countries.json", function(collection) {
   collection.features.forEach(function(d){
      for(var key in map_view){
        if(map_view.hasOwnProperty(key)){
          if(d.id === key){
            d["searches"] = map_view[key];
          }
        }
      }
    });

    countrystore.rows(collection);

    x.domain([0, barchart_view[0][1]])

    create_barchart(barchart_view);
    create_map(countrystore);
  });
});
