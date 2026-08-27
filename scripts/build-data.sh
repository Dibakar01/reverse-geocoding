#!/bin/sh
# Downloads GeoNames dumps and trims them to the columns we actually use.
# Output: data/places.tsv.gz  (name, lat, lon, country, admin1, admin2, population,
#                              featureCode, cityIndex)
set -eu
cd "$(dirname "$0")/.."
base=https://download.geonames.org/export/dump
rm -rf tmp-geonames && mkdir -p tmp-geonames data && cd tmp-geonames

echo "Downloading GeoNames dumps (~21 MB)..."
curl -fsSL -O "$base/IN.zip"              # full India gazetteer, ~558k populated places
curl -fsSL -O "$base/cities5000.zip"      # rest of world, population >= 5000
curl -fsSL -O "$base/admin1CodesASCII.txt"
curl -fsSL -O "$base/admin2Codes.txt"
curl -fsSL -O "$base/countryInfo.txt"
unzip -oq IN.zip IN.txt
unzip -oq cities5000.zip cities5000.txt

# GeoNames columns: 2=name 3=asciiname 5=lat 6=lon 7=featureClass 8=featureCode
#                    9=country 11=admin1 12=admin2 15=population
# asciiname is preferred: half of all Indian place names carry diacritics
# (Alīgarh, Āsansol) and the plain spellings are what readers expect.
echo "Building data/places.tsv.gz..."
row='{n = ($3 != "" ? $3 : $2); print n"\t"$5"\t"$6"\t"$9"\t"$11"\t"$12"\t"$15"\t"$8}'
{ awk -F'\t' "\$7==\"P\" $row" IN.txt
  awk -F'\t' "\$9!=\"IN\" $row" cities5000.txt
} > places.raw.tsv

# Administrative units, to catch settlement records that carry a district or
# taluk's population instead of the town's.
awk -F'\t' '$7=="A" && ($8=="ADM2"||$8=="ADM3") && $15>0 {n=($3!=""?$3:$2); print n"\t"$15}' \
  IN.txt > admin-units.tsv
cp admin1CodesASCII.txt admin2Codes.txt countryInfo.txt ../data/

# Club every place to a parent city, once, at build time.
cd ..
node scripts/assign-cities.mjs tmp-geonames/places.raw.tsv tmp-geonames/admin-units.tsv \
  | gzip -9 > data/places.tsv.gz

rm -rf tmp-geonames
echo "Done: $(ls -lh data/places.tsv.gz | awk '{print $5}') in data/places.tsv.gz"
