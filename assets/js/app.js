(function () {
    const api = {
        loading: true,
        checkLoading: function () {
            const preloader = document.querySelector(".preloader");

            if(!this.loading) {
                preloader.classList.add("hidden");
            } else {
                preloader.classList.remove("hidden");
            }
        },
        // The Sparql query that gets all the data
        // ORDER BY DESC(?date)
        // ORDER BY ?date
        sparqlQuery: `
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX hg: <http://rdf.histograph.io/>
            PREFIX sem: <http://semanticweb.cs.vu.nl/2009/11/sem/>
            PREFIX geo: <http://www.opengis.net/ont/geosparql#>
            
            SELECT ?straat ?label ?date ?wkt WHERE {
              ?straat rdf:type hg:Street .
              ?straat rdfs:label ?label .
              ?straat sem:hasEarliestBeginTimeStamp ?date .
              ?straat geo:hasGeometry ?geo .
              ?geo geo:asWKT ?wkt .
            }
            
            ORDER BY ?date
            LIMIT 9999`,
        // The URL
        queryUrl: function () {
            return 'https://api.data.adamlink.nl/datasets/AdamNet/all/services/hva2018/sparql?default-graph-uri=&query=' + encodeURIComponent(this.sparqlQuery) + '&format=application%2Fsparql-results%2Bjson&timeout=0&debug=on'
        },
        // Function that puts the data in the content object and fires the render function
        setData: function () {
            fetch(this.queryUrl())
                // transform the data into json
                .then((resp) => resp.json())
                .then((data) => {
                    content.streets = data.results.bindings;
                    content.render();
                    this.loading = false;
                    this.checkLoading();
                })
                .catch(function(error) {
                    // if there is any error you will catch them here
                    console.log(error);
                });
        }
    };

    const content = {
        streets: [],
        // Template for a timeline part
        createTemplate: function (year, streetName) {
            return `<div class="timeline-part year-${year}">
                        <div class="timeline-graph"></div>
                        <div class="timeline-meta">
                            <h3 class="year">${year}</h3>
                            <ul class="streets">
                                <li>${streetName}</li>
                            </ul>
                        </div>
                    </div>`
        },
        renderStreets: function () {
            let latestYear = 0;

            this.streets.forEach((item) => {

                // Push a new line to the map object, this is going to be used to render the lines
                map.lines.push({
                    // Convert the WKT value to geoJSON using the terraformer
                    geoJSON: Terraformer.WKT.parse(item.wkt.value),
                    // Also save the year property to the line object
                    year: item.date.value
                });

                if(item.date.value > latestYear) {
                    latestYear = item.date.value;
                    // if the year of the street is higher than the latest year a new timeline part will be added
                    let html = this.createTemplate(item.date.value, item.label.value);
                    document.querySelector(".timeline").insertAdjacentHTML('beforeend', html);
                } else {
                    // If not the streetname will be added under the same year
                    document.querySelector(".year-" + latestYear + " .streets").insertAdjacentHTML('beforeend', `<li>${item.label.value}</li>`);
                }
            });

            listToggle.init();
            map.filterLines();
            map.addLines();
            map.autoZoom();
        },
        // Render function that can be extended when there is more data to render.
        render: function () {
            this.renderStreets();
        }
    };

    const map = {
        canvas: null,
        lineStyle: {
            "fillColor": "#FF4343",
            "color": "#FF4343",
            "weight": 1,
        },
        lines: [],
        filteredLines: [],
        geoJSONlayers: [],
        outerBounds: {
            northEast: {
                lat: -90, // Minimum lat
                lng: -180, // Minimum lng
            },
            southWest: {
                lat: 90, // Maximum lat
                lng: 180, // Maximum lng
            }
        },
        // Filter all streets that don't have a geoJSON line.
        filterLines: function () {
            this.lines = this.lines.filter(function (item) {
                if (item.geoJSON.type !== "Point") {
                    return item
                }
            });
        },
        // Filter the lines by given year
        filterLinesByYear: function (year) {
            this.filteredLines = this.lines.filter(function (item) {
                if (item.year <= year) {
                    return item
                }
            });
        },
        // Clear all layers
        clearLayers: function () {
            this.geoJSONlayers.forEach((item) => {
                if(this.canvas.hasLayer(item)) {
                    this.canvas.removeLayer(item);
                }
            });
        },
        // Get the outherbounds of all the available geoJSON layers
        setOuterBounds: function () {
            this.geoJSONlayers.forEach((item) => {
                let bounds = item.getBounds();

                // Set north eastern lat to highest val
                if(bounds._northEast.lat > this.outerBounds.northEast.lat) {
                    this.outerBounds.northEast.lat = bounds._northEast.lat
                }

                // Set north eastern lng to highest val
                if(bounds._northEast.lng > this.outerBounds.northEast.lng) {
                    this.outerBounds.northEast.lng = bounds._northEast.lng
                }

                // Set south western lang to lowest val
                if(bounds._southWest.lat < this.outerBounds.southWest.lat) {
                    this.outerBounds.southWest.lat = bounds._southWest.lat
                }

                // Set south western lang to lowest val
                if(bounds._southWest.lng < this.outerBounds.southWest.lng) {
                    this.outerBounds.southWest.lng = bounds._southWest.lng
                }
            });
        },
        // Automatically adjust the map to fit all the geojson objects
        autoZoom: function () {
            this.setOuterBounds();
            this.canvas.flyToBounds([
                [this.outerBounds.northEast.lat, this.outerBounds.northEast.lng],
                [this.outerBounds.southWest.lat, this.outerBounds.southWest.lng]
            ]);
        },
        // Add the lines to the map
        addLines: function () {
            this.filterLinesByYear(filter.checkVisbileYear());
            this.clearLayers();
            this.filteredLines.forEach((item) => {
                let layer = L.geoJSON(item.geoJSON).addTo(this.canvas);
                this.geoJSONlayers.push(layer);
            });
            this.setLineStyle();
        },
        // Set the line styles
        setLineStyle: function () {
            this.geoJSONlayers.forEach((layer) => {
                layer.setStyle(this.lineStyle);
            });
        },
        init: function () {
            this.canvas = L.map('map', {
                center: [52.37959297229016, 4.901649844832719],
                zoom: 11,
            });

            let Stamen_TonerLite = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}.{ext}', {
                attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                minZoom: 12,
                maxZoom: 20,
                ext: 'png'
            }).addTo(this.canvas);
        }
    };

    const filter = {
        sidebar: document.querySelector("aside"),
        // If a timeline part is visible this returns the year of that part
        checkVisbileYear: function () {
            let visibleParts = [];
            this.sidebar.querySelectorAll(".timeline-part").forEach((element) => {
                if(element.offsetTop <= this.sidebar.scrollTop + window.innerHeight) {
                    visibleParts.push(element);
                    element.classList.add('active');
                } else {
                    element.classList.remove('active');
                }
            });

            return visibleParts[visibleParts.length-1].querySelector(".year").innerText;
        },
        init: function () {
            const _this = this;
            let isScrolling = false;

            this.sidebar.addEventListener('scroll', function(event) {

                // Hide the scroll indicator
                document.querySelector(".scroll-indicator").classList.add("slide-out");

                // We don't want to update the map every scroll event because that will be slow
                // Source: https://gomakethings.com/detecting-when-a-visitor-has-stopped-scrolling-with-vanilla-javascript/

                // Clear our timeout throughout the scroll
                window.clearTimeout( isScrolling );

                // Set a timeout to run after scrolling ends
                isScrolling = setTimeout(function() {
                    map.addLines();
                    map.autoZoom();
                }, 66);
            });
        }
    };

    const story = {
        animation: null,
        interval: null,
        paused: true,
        // Reset the sroll position of the sidebar
        reset: function () {
            filter.sidebar.scrollTo(0, 0);
            map.addLines();
            map.autoZoom();
        },
        // Autoscroll the year list and update the map once in a while
        play: function () {
            this.reset();

            let timelineParts = filter.sidebar.querySelectorAll(".timeline-part");
            let scrollDistance = timelineParts[timelineParts.length-1].offsetTop;
            let scrollTime = scrollDistance*5;
            let _this = this;
            this.paused = false;

            // Start the scrolling
            this.doScrolling(scrollDistance, scrollTime);

            // Interval that updates the map once in a while
            this.interval = setInterval(function () {
                map.addLines();
                map.autoZoom();
            }, scrollTime/10);

            // Stop the interval when the scrolling is done
            setTimeout(function () {
                clearInterval(_this.interval);
            }, scrollTime);
        },
        // Pause the scroll animation and stop the interval
        pause: function () {
            this.paused = true;

            window.cancelAnimationFrame(this.animation);
            clearInterval(this.interval);
        },
        // Scroll to function using requestanimationframe
        // Source: https://stackoverflow.com/questions/17722497/scroll-smoothly-to-specific-element-on-page
        doScrolling: function (elementY, duration) {
            let startingY = window.pageYOffset;
            let diff = elementY - startingY;
            let start;
            let _this = this;

            // Bootstrap our animation - it will get called right before next frame shall be rendered.
            this.animation = window.requestAnimationFrame(function step(timestamp) {
                if (!start) start = timestamp;
                // Elapsed milliseconds since start of scrolling.
                let time = timestamp - start;
                // Get percent of completion in range [0, 1].
                let percent = Math.min(time / duration, 1);

                filter.sidebar.scrollTo(0, startingY + diff * percent);

                // Proceed with animation as long as we wanted it to.
                if (time < duration && _this.paused !== true) {
                    window.requestAnimationFrame(step);
                }
            })
        },
        init: function () {
            const playBtn = document.querySelector("#play");
            const pauseBtn = document.querySelector("#pause");

            // Add play function to play button
            playBtn.addEventListener("click", (ev) => {
                this.play();
                playBtn.classList.add("hidden");
                pauseBtn.classList.remove("hidden");
            });

            // Add pause function to pause button
            pauseBtn.addEventListener("click", (ev) => {
                this.pause();
                pauseBtn.classList.add("hidden");
                playBtn.classList.remove("hidden");
            });
        }
    };

    const listToggle = {
        toggle: function (element) {
              element.classList.toggle("toggled");
        },
        init: function () {
            const lists = document.querySelectorAll(".streets");
            const _this = this;

            lists.forEach((list) => {
                list.addEventListener("click", function (event) {
                    _this.toggle(this);
                })
            });
        }
    };

    const app = {
        init: function () {
            api.setData();
            map.init();
            filter.init();
            story.init();
        }
    };

    app.init();
})();