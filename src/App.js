import React from 'react';
import pdfjsLib from 'pdfjs-dist/webpack';
import spinner from './spinner.gif';
import howtoImg from './howto.png';
import spendingByCategoryImg from './spending_by_category.png';
import spendingByCategoryPieImg from './spending_by_category_pie.png';
import incomingOutgoingImg from './incoming_outgoing.png';
import tableImg from './table.png';
import async from 'async';
import './App.css';
import sha256 from 'sha256';
import 'react-tabulator/lib/styles.css';
import 'tabulator-tables/dist/css/tabulator.min.css'; //import Tabulator stylesheet
import {ReactTabulator} from 'react-tabulator';
import {Pie, Bar} from 'react-chartjs-2';
import rcolor from 'rcolor';
import Dropdown from 'react-dropdown';
import {BrowserView, MobileView} from 'react-device-detect';
import categories from './categories.js';
import 'react-dropdown/style.css';
import {format} from 'date-fns';
import { decode, encode } from "universal-base64";

window.pdfjsLib = pdfjsLib;

window.addCommas = function(nStr) {
  nStr += '';
  let x = nStr.split('.');
  let x1 = x[0];
  let x2 = x.length > 1 ? '.' + x[1] : '';
  let rgx = /(\d+)(\d{3})/;
  while (rgx.test(x1)) {
    // eslint-disable-next-line
    x1 = x1.replace(rgx, '$1' + ',' + '$2');
  }
  return x1 + x2;
};

const defaultState = {
  value: null,
  files: [],
  loading: false,
  done: false,
  tableViewEnabled: false,
  categorySpendingEnabled: false,
  incomingOutgoingEnabled: false,
  csvString: '',
  csvFileName: 'transaction_history',
  monthMap: [
    'january',
    'februari',
    'march',
    'april',
    'may',
    'june',
    'july',
    'augustus',
    'september',
    'october',
    'november',
    'december',
  ],
  jeniusCategories: [],
  // Main data
  rows: [],
  columns: [
    {title: 'pocketName', field: 'pocketName'},
    {title: 'id', field: 'id'},
    {title: 'transactionNumber', field: 'transactionNumber'},
    {title: 'dateTime', field: 'dateTime'},
    {title: 'mutationType', field: 'mutationType'},
    {title: 'category', field: 'category'},
    {title: 'entityName', field: 'entityName'},
    {title: 'entityDetail', field: 'entityDetail'},
    {title: 'amount', field: 'amount', align: 'right'},
    {title: 'readableAmount', field: 'readableAmount', align: 'right'},
  ],
  spendingByCategoryDataCurrentRange: 'all',
  spendingByCategoryData: {
    all: {
      datasets: [{data: [], backgroundColor: []}],
      labels: [],
    },
  },
  incomingOutgoingDataCurrentRange: 'all',
  incomingOutgoingData: {
    all: {
      datasets: [{data: [], backgroundColor: []}],
      labels: [],
    },
  },
  incomingOutgoingStackedData: {
    datasets: [{data: [], backgroundColor: []}, {data: [], backgroundColor: []}],
    labels: [],
  },
  timeRangeKeys: [],
  spendingByCategoryChartType: 'Pie',
  chartTypes: ['Pie', 'Bar'],
};

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
  }
  componentDidMount = () => {
    defaultState.jeniusCategories = categories.incomingCategories.concat(
      categories.outgoingCategories,
    );
    this.setState(defaultState);
  };
  renderToText = pageData => {
    return new Promise((resolve, reject) => {
      let render_options = {
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      };
      return pageData
        .getTextContent(render_options)
        .then(function(textContent) {
          let lastY,
            text = '';
          for (let item of textContent.items) {
            if (lastY === item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }
          resolve(text);
        })
        .catch(err => {
          reject(err);
        });
    });
  };
  downloadCsv = () => {

  }
  parse = data => {
    // Some PDFs were generated with tab instead of space
    let lines = data.text.split(/\r?\n/);
    let report = [];
    let isOnItem = false;
    let currentItem = {};
    let currentItemFieldNumber = 0;

    let accountHolder = ''
    let pocketDetail = ''

    let next = ''

    // Looking for account holder and pocket name
    for (let i in lines) {
      let line = lines[i];
      //console.log(i + ':' + line);
      if (line.includes('Pockets') && line.includes('Transactions')) {
        next = 'paginationInfo';
        continue;
      }
      if (next == 'paginationInfo') {
        next = 'accountHolder';
        continue;
      }
      if (next == 'accountHolder') {
        accountHolder = line.replace(/\s+/g, ' ');
        next = 'pocketDetail';
        continue;
      }
      if (next == 'pocketDetail') {
        pocketDetail = line.replace(/\s+/g, ' ');
        next = '';
        break;
      }
      if (i > 50) { // limit
        break;
      }
    }

    //console.log(accountHolder);
    //console.log(pocketDetail);

    next = 'date';

    for (let i in lines) {
      let line = lines[i];
      line = line.replace(/\s+/g, ' '); // Change multiple spaces to single space
      //alert(line);
      console.log('looking for ' + next);

      if (next === 'date') {
        if (line.length != 11 || isNaN(line.substring(0,2))) {
          console.log('Not a valid date string: ' + line)
          continue;
        }
        console.log('This is a valid date string: ' + line);
        // Split by tabs or spaces and check if it matches date pattern
        let parts = line.trim().split(/[\t\s]+/);
        if (parts.length === 3) {
          let day = parts[0];
          let month = parts[1];
          let year = parts[2];
        
          // Check if parts match expected format
          if (
            // Day is 1-31
            !isNaN(day) && parseInt(day) > 0 && parseInt(day) <= 31 &&
            // Month is 3 letter abbreviation
            month.length === 3 && isNaN(month) &&
            // Year is 4 digit number
              !isNaN(year) && year.length === 4
          ) {
            try {
              let date = new Date(`${month} ${day} ${year}`);
              if (date.toString() !== 'Invalid Date') {
                currentItem = {};
                currentItem[next] = date;
                currentItemFieldNumber = 1;
                console.log(next + ' found: ' + line);
                next = 'time';
                console.log('next looking: ' + next);
                continue;
              }
            } catch (e) {
              // Invalid date format, continue to next line
              continue;
            }
          } else {
            continue;
          }
        }
      }

      if (next === 'time' && line.length === 5) {
        let time = line;
        currentItem['date'] = new Date(currentItem['date'].setHours(parseInt(time.split(':')[0]), parseInt(time.split(':')[1])));
        console.log(next + ' found: ' + line);
        next = 'entityName';
        console.log('next looking: ' + next);
        continue;
      }

      if (next === 'entityName') {
        // entityName can be merged without separator with category
        let continueToTransactionNumber = false;
        for (let i in categories.outgoingCategories) {
          let category = categories.outgoingCategories[i];
          if (line.indexOf(category) > -1) {
            console.log(next + ' found: ' + line);
            currentItem['category'] = category;
            continueToTransactionNumber = true;
          }
        }
        for (let i in categories.incomingCategories) {
          let category = categories.incomingCategories[i];
          if (line.indexOf(category) > -1) {
            console.log(next + ' found: ' + line);
            currentItem['category'] = category;
            continueToTransactionNumber = true;
          }
        }

        if (continueToTransactionNumber) {
          next = 'transactionNumber';
          console.log('next looking: ' + next);
          continue;
        }

        if (categories.outgoingCategories.includes(line)) {
          console.log(next + ' found: ' + line);
          currentItem['category'] = line;
          next = 'transactionNumber';
          console.log('next looking: ' + next);
          continue;
        } else if (categories.incomingCategories.includes(line)) {
          console.log(next + ' found: ' + line);
          currentItem['category'] = line;
          next = 'transactionNumber';
          console.log('next looking: ' + next);
          continue;
        } else {
          console.log('not contains any categories: ' + line);
        }
        if (line.includes('Movement between')) {
          // Start over, we don't want to record movement between pocket
          next = 'date';
          console.log('start over, next looking: ' + next);
          currentItem = {};
          continue;
        }
        if (!categories.incomingCategories.includes(line) &&
        !categories.outgoingCategories.includes(line)
        ) {
          if (line === undefined) line = '';
          if (currentItem[next] === undefined) currentItem[next] = '';
          currentItem[next] += line + ' ';
          console.log(next + ' found: ' + line);
          next = 'entityName';
          console.log('next looking: ' + next);
          continue;
        } else {
          console.log('category found when looking for entityName, move on to category')
          next = 'category';
          if (line.includes('Movement between')) {
            // Start over, we don't want to record movement between pocket
            next = 'date';
            currentItem = {};
            continue;
          }
        }
      }

      if (next === 'category') {
        if (line.includes('Movement between')) {
          // Start over, we don't want to record movement between pocket
          next = 'date';
          currentItem = {};
          continue;
        }
        if (categories.incomingCategories.includes(line)) {
          console.log(next + ' found: ' + line);
          currentItem['category'] = line;
          next = 'transactionNumber';
          console.log('next looking: ' + next);
        } else if (categories.outgoingCategories.includes(line)) {
          console.log(next + ' found: ' + line);
          currentItem['category'] = line;
          next = 'transactionNumber';
          console.log('next looking: ' + next);
        } else {
          let message = 'Unrecognized category/mutation type: ' + line + '. Please report to herpiko@gmail.com to help improve Jagor!';
          console.log(message);
          alert(message);
          continue;
        }
        continue;
      }

      if (next === 'transactionNumber') {
        if (line === currentItem['category']) {
          continue;
        }
        console.log(next + ' found: ' + line);
        currentItem[next] = line;
        next = 'amount';
        console.log('next looking: ' + next);
        continue;
      }

      if (next === 'amount') {
        if (line[0].includes('+') || line[0].includes('-')) {
          console.log('amount: ' + line);
          if (line[0] === '+') {
            currentItem.mutationType = 'debit';
          }
          if (line[0] === '-') {
            currentItem.mutationType = 'credit';
          }
          line = line.substring(1);
          // The amount value is being merged with balance value with no separator
          // Separate it manually.
          // Example merged value: -1.000.00020.003.043
          // Case #1
          //line = '212.497436.213'; // -> Rp212.497
          // Case #2
          //line = '50.0001.670.000'; // -> Rp50.000
          // Case #3
          //line = '35064.054'; // -> Rp350
          //line = '691.048.063'; // -> 69, from Tax on Interest
          let thousandArr = line.split('.');
          let amount = '';
          for (let i in thousandArr) {
            if (i == 0) {
              if (thousandArr[i].length > 3) {
                thousandArr[i] = thousandArr[i].substring(0,3);
                console.log('first item, pushing ' + thousandArr[i] + ' into amount');
                amount += thousandArr[i];
                break;
              }
              console.log('first item, pushing ' + thousandArr[i] + ' into amount');
              amount += thousandArr[i];
              continue;
            }

            if (thousandArr[i].length == 3) {
              console.log('3-digit item, pushing ' + thousandArr[i] + ' into amount');
              amount += thousandArr[i];
              continue;
            }

            if (thousandArr[i].length > 3) {
              console.log('the last 3-digit item, pushing ' + thousandArr[i] + ' into amount');
              thousandArr[i] = thousandArr[i].substring(0,3);
              amount += thousandArr[i];
              break;
            }
          }
         
          // There is no way that tax on interest will be greater than Rp10.000
          // If it happened, then this is a case #3. Let's cut it to two digit value.
          let amountInt = parseInt(amount, 10);
          if (amountInt > 10000 && currentItem['category'].toLowerCase() == 'tax on interest') {
            console.log('---------------x');
            amount = amount.substring(0,2);
          }

          console.log(next + ' found: ' + amount);
          currentItem[next] = amount; // keep it in string
          let readableAmount = 'Rp' + amount.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
          currentItem['readableAmount'] = readableAmount;
          currentItem['pocketName'] = pocketDetail;
          console.log('pushing item to array');
          console.log(currentItem);
          report.push(currentItem);
          currentItem = {};

          // Start again to search another item
          next = 'date';
          console.log('start over, next looking: ' + next);
        } else {
          continue;
        }
      }
    }
    /**


    for (let i in lines) {
      let line = lines[i];
      // Keep replacing multiple spaces until no more multiple spaces exist
      while (line.match(/\s{2,}/)) {
        line = line.replace(/\s{2,}/g, ' ');
      }
      lines[i] = line;

      if (isOnItem) {
        switch (currentItemFieldNumber) {
          case 1:
            currentItem.time = lines[i].trim();
            currentItemFieldNumber++;
            break;
          case 2:
            currentItem.entityName = lines[i].trim();
            currentItemFieldNumber++;
            break;
          case 3:
            if (lines[i].trim().indexOf(' | ') < 0) {
              currentItem.entityDetail = lines[i].trim();
              currentItemFieldNumber++;
              break;
            } else {
              currentItemFieldNumber++;
            }
          // eslint-disable-next-line
          case 4:
            currentItem.transactionNumber = lines[i].trim().split(' | ')[0];
            currentItem.category = lines[i].trim().split(' | ')[1];
            currentItemFieldNumber++;
            break;
          case 5:
            if (lines[i].trim().split(' ')[0] === '-') {
              currentItem.mutationType = 'credit';
            } else if (lines[i].trim().split(' ')[0] === '+') {
              currentItem.mutationType = 'debit';
            }
            isOnItem = false;
            currentItemFieldNumber = 0;
            currentItem.amount = lines[i].trim().split(' ')[1];
            if (!Number.isNaN(currentItem.amount)) {
              report.push(currentItem);
            }
            currentItem = {};
            break;
          default:
            // Do nothing
            break;
        }
      } else {
        let isError = false;
        let date;
        let dateString;
        try {
          date = new Date(lines[i]);
          dateString = date.toString();
        } catch (e) {
          isError = true;
        }
        if (
          !isError &&
          dateString !== 'Invalid Date' &&
          lines[i].split(' ').length === 3
        ) {
          isOnItem = true;
          currentItem.date = date;
          currentItemFieldNumber = 1;
        }
      }
    }
     * 
     */
    report.reverse();
    return report;
  };
  handlePDF = arrayBuffer => {
    let doc;
    let metaData;
    let ret = {
      numpages: 0,
      numrender: 0,
      info: null,
      metadata: null,
      text: '',
      version: null,
    };
    pdfjsLib
      .getDocument(arrayBuffer)
      .then(result => {
        doc = result;
        ret.numpages = doc.numPages;
        return doc.getMetadata();
      })
      .then(result => {
        metaData = result;
        let counter = doc.numPages;
        counter = counter > doc.numPages ? doc.numPages : counter;

        ret.text = '';
        let it = [];
        for (var i = 1; i <= counter; i++) {
          it.push(i);
        }
        async.eachSeries(
          it,
          (i, cb) => {
            doc
              .getPage(i)
              .then(pageData => {
                return this.renderToText(pageData);
              })
              .then(pageText => {
                ret.text += '\n\n' + pageText;
                cb();
                return;
              })
              .catch(err => {
                console.log(err);
                //cb(err);
                return;
              });
          },
          err => {
            if (err) console.log(err);
            ret.metaData = metaData;
            ret.numrender = counter;
            //console.log('============================');
            //console.log(ret.text);
            doc.destroy();
            let data = null
            try {
              data = this.parse(ret);
            } catch (err) {
              alert('An error occured!');
            }
            this.processDb(data);
          },
        );
      })
      .catch(err => {
        console.log(err);
      });
  };

  processDb = data => {
    console.log('-------------------- data length');
    console.log(data.length);
    let count = -1;
    let result = [];
    let csvString = ''
    async.eachSeries(
      data,
      (record, cb) => {
        count++;
        // Ensure it has unique id
        record._id = sha256(
          count +
            record.transactionNumber +
            record.date.toISOString() +
            record.time +
            '',
        );
        record.id = count + 1;
        record.date = new Date(record.date);
        record.dateTime = new Date(record.date);
        if (
          record.time &&
          record.time.length === 5 &&
          record.time.indexOf(':') > -1
        ) {
          record.dateTime = record.date;
          record.dateTime.setHours(parseInt(record.time.split(':')[0], 10));
          record.dateTime.setMinutes(parseInt(record.time.split(':')[1], 10));
        }
        record.amount = parseInt(record.amount.replace(/,/g, ''), 10);
        if (!Number.isNaN(record.amount)) {
          result.push(record);
          //console.log(record.dateTime);
          csvString += `${record._id},${format(record.dateTime, 'yyyy-MM-dd HH:mm')},${record.transactionNumber},${record.mutationType},${record.category},${record.entityName},${record.entityDetail},${record.amount}\n`
        }
        cb();
      },
      err => {
        console.log(err);
        //console.log(csvString);
        this.setState(
          {
            csvString: csvString,
            rows: result,
            tableViewEnabled: true,
            categorySpendingEnabled: true,
            incomingOutgoingEnabled: true,
          },
          () => {
            this.processChart();
          },
        );
      },
    );
  };

  processChart = () => {
    let cat = {all: {}};
    let end = new Date(this.state.rows[0].dateTime);
    let beginning = new Date(
      this.state.rows[this.state.rows.length - 1].dateTime,
    );
    let currentTime = new Date(beginning);
    let timeRange = {};
    timeRange[currentTime.getFullYear().toString()] =
      timeRange[currentTime.getFullYear().toString()] || [];
    //timeRange[currentTime.getFullYear().toString()].push(
    //  currentTime.getMonth(),
    //);
    let breakTimeLoop = true;
    currentTime.setDate(1);
    let count = 0;

    //console.log(timeRange);
    while (breakTimeLoop) {
      count++;
      //if (count > 100) {
      //  break;
      //}
      //alert(currentTime);
      timeRange[currentTime.getFullYear().toString()] =
        timeRange[currentTime.getFullYear().toString()] || [];

      //alert('1. Pushing ' + (currentTime.getMonth() + 1) + ' to ' +currentTime.getFullYear().toString());
      //console.log('1. Pushing ' + (currentTime.getMonth() + 1) + ' to ' +currentTime.getFullYear().toString());
      //console.log(timeRange);
      timeRange[currentTime.getFullYear().toString()].push(
        currentTime.getMonth() + 1,
      );

      if (currentTime.getMonth() + 1 === 12) {
        currentTime.setYear(currentTime.getFullYear() + 1);
        currentTime.setMonth(0);
      } else {
        currentTime.setMonth(currentTime.getMonth() + 1);
      }

      // Finding the end
      if (
        currentTime.getFullYear() === end.getFullYear() &&
        currentTime.getMonth() === end.getMonth()
      ) {
        breakTimeLoop = false;
        timeRange[currentTime.getFullYear().toString()] =
          timeRange[currentTime.getFullYear().toString()] || [];

        //alert('2. Pushing ' + (currentTime.getMonth() + 1) + ' to ' +currentTime.getFullYear().toString());
        //console.log('2. Pushing ' + (currentTime.getMonth() + 1) + ' to ' +currentTime.getFullYear().toString());
        //console.log(timeRange);
        timeRange[currentTime.getFullYear().toString()].push(
          currentTime.getMonth() + 1,
        );
      }
    }

    //console.log('--------------------------- timerange');
    //console.log(timeRange);
    for (let i in this.state.jeniusCategories) {
      cat.all[this.state.jeniusCategories[i]] = 0;
      for (let j in Object.keys(timeRange)) {
        let year = Object.keys(timeRange)[j];
        for (let k in timeRange[year]) {
          cat[year + '_' + this.state.monthMap[timeRange[year][k] - 1]] =
            cat[year + '_' + this.state.monthMap[timeRange[year][k] - 1]] || {};
          cat[year + '_' + this.state.monthMap[timeRange[year][k] - 1]][
            this.state.jeniusCategories[i]
          ] = 0;
        }
      }
    }

    //console.log('------------ all cat');
    //console.log(cat);
    this.setState({timeRangeKeys: Object.keys(cat).reverse()});

    for (let i in this.state.rows) {
      let dateTime = new Date(this.state.rows[i].dateTime);
      //console.log('------------ pushing row into categorized time range');
      //console.log(dateTime);
      let currentRange =
        dateTime.getFullYear() + '_' + this.state.monthMap[dateTime.getMonth()];

      //console.log(currentRange);

      cat[currentRange] = cat[currentRange] || {}
      if (this.state.rows[i].mutationType === 'credit') {
        cat.all['totalOutgoing'] = cat.all['totalOutgoing'] || 0;
        cat.all['totalOutgoing'] += this.state.rows[i].amount;
        cat[currentRange]['totalOutgoing'] =
          cat[currentRange]['totalOutgoing'] || 0;
        cat[currentRange]['totalOutgoing'] += this.state.rows[i].amount;
      } else {
        cat.all['totalIncoming'] = cat.all['totalIncoming'] || 0;
        cat.all['totalIncoming'] += this.state.rows[i].amount;
        cat[currentRange]['totalIncoming'] =
          cat[currentRange]['totalIncoming'] || 0;
        cat[currentRange]['totalIncoming'] += this.state.rows[i].amount;
      }
      cat.all[this.state.rows[i].category] += this.state.rows[i].amount;
      cat[currentRange][this.state.rows[i].category] += this.state.rows[
        i
      ].amount;
    }
    // Init
    let spendingByCategoryData = {
      all: {
        datasets: [{data: [], backgroundColor: []}],
        labels: [],
      },
    };
    let incomingOutgoingData = {
      all: {
        datasets: [{data: [], backgroundColor: []}],
        labels: [],
      },
    };
    let incomingOutgoingStackedData = {
      datasets: [
        {data: [], backgroundColor: []},
        {data: [], backgroundColor: []},
      ],
      labels: [],
    };
    let blankData = JSON.parse(JSON.stringify(spendingByCategoryData.all));
    let catKeys = Object.keys(cat.all);

    //console.log('--------------- catKeys');
    //console.log(catKeys);
    for (let i in catKeys) {
      //console.log(catKeys[i]); // category
      let keys = Object.keys(cat);

      //console.log('--------------------------catKeys keys');
      //console.log(keys);

      for (let j in keys) {
        //console.log('-------------------------')
        //console.log(keys[j]) // month
        //console.log(catKeys[i]) // category
        //console.log(cat[keys[j]][catKeys[i]]) //value

        // Spending by category
        spendingByCategoryData[keys[j]] =
          spendingByCategoryData[keys[j]] ||
          JSON.parse(JSON.stringify(blankData));
        if (
          cat[keys[j]][catKeys[i]] > 0 &&
          // Ignore total incoming and total outgoing
          catKeys[i] !== 'totalIncoming' &&
          catKeys[i] !== 'totalOutgoing'
        ) {
          let color = rcolor();
          spendingByCategoryData[keys[j]].datasets[0].data.push(
            cat[keys[j]][catKeys[i]],
          );
          spendingByCategoryData[keys[j]].datasets[0].backgroundColor.push(
            color,
          );
          spendingByCategoryData[keys[j]].labels.push(catKeys[i]);
        }
        // Incoming vs outgoing
        incomingOutgoingData[keys[j]] =
          incomingOutgoingData[keys[j]] ||
          JSON.parse(JSON.stringify(blankData));
        if (incomingOutgoingData[keys[j]].labels.length < 2) {
          incomingOutgoingData[keys[j]].datasets[0].backgroundColor.push(
            'green',
          );
          incomingOutgoingData[keys[j]].labels.push('Incoming');
          incomingOutgoingData[keys[j]].datasets[0].data[0] = 0;
          incomingOutgoingData[keys[j]].datasets[0].backgroundColor.push('red');
          incomingOutgoingData[keys[j]].labels.push('Outgoing');
          incomingOutgoingData[keys[j]].datasets[0].data[1] = 0;
        }
        if (catKeys[i] === 'totalIncoming') {
          let value = cat[keys[j]][catKeys[i]] || 0;
          value += cat[keys[j]][catKeys[i]];
          incomingOutgoingData[keys[j]].datasets[0].data[0] = value;
        } else if (catKeys[i] === 'totalOutgoing') {
          let value = incomingOutgoingData[keys[j]].datasets[0].data[1] || 0;
          value += cat[keys[j]][catKeys[i]];
          incomingOutgoingData[keys[j]].datasets[0].data[1] = value;
        }

        // Incoming vs outgoing, stacked
        if (
          incomingOutgoingStackedData.labels.indexOf(keys[j]) < 0 &&
          keys[j] !== 'all'
        ) {
          incomingOutgoingStackedData.labels.push(keys[j]);
        }
        incomingOutgoingStackedData.datasets[0].label =
          incomingOutgoingStackedData.datasets[0].label || 'Incoming';
        incomingOutgoingStackedData.datasets[0].backgroundColor = 'deepskyblue';
        if (
          catKeys[i] === 'totalIncoming' &&
          cat[keys[j]][catKeys[i]] &&
          parseInt(cat[keys[j]][catKeys[i]], 10) > 0
        ) {
          incomingOutgoingStackedData.datasets[0].data.push(
            parseInt(cat[keys[j]][catKeys[i]], 10),
          );
        }
        incomingOutgoingStackedData.datasets[1].label =
          incomingOutgoingStackedData.datasets[1].label || 'Outgoing';
        incomingOutgoingStackedData.datasets[1].backgroundColor = 'maroon';
        if (
          catKeys[i] === 'totalOutgoing' &&
          cat[keys[j]][catKeys[i]] &&
          parseInt(cat[keys[j]][catKeys[i]], 10) > 0
        ) {
          let out = parseInt(cat[keys[j]][catKeys[i]], 10);
          out = 0 - out;
          incomingOutgoingStackedData.datasets[1].data.push(out);
        }
      }
    }
    //console.log(incomingOutgoingStackedData);
    this.setState({
      spendingByCategoryData: spendingByCategoryData,
      incomingOutgoingData: incomingOutgoingData,
      incomingOutgoingStackedData: incomingOutgoingStackedData,
      loading: false,
      done: true,
    });
  };

  handleChange = files => {
    let reader = new FileReader();
    reader.onload = () => {
      let typedArray = new Uint8Array(reader.result);
      this.setState({loading: true}, () => {
        this.handlePDF(typedArray);
      });
    };
    reader.readAsArrayBuffer(files[0]);
  };

  render() {
    return (
      <div className="App">
        {this.state.loading && (
          <div style={{marginTop: '40vh'}}>
            <img src={spinner} className="App-logo" alt="logo" />
          </div>
        )}
        {!this.state.done && (
          <header className="App-header">
            {!this.state.loading && (
              <div style={{width: '100%'}}>
                <div
                  style={{width: '100%', height: '60vh', paddingTop: '30vh'}}>
                  <h1>Jagor</h1>
                  <p>Your Jago Transaction History Parser</p>
                  <input
                    type="file"
                    onChange={e => this.handleChange(e.target.files)}
                  />
                  <p style={{fontSize:'11px'}}>The parser only supports English version of transaction history document</p>
                </div>
                <div
                  style={{
                    backgroundImage:
                      'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMTVweCIgdmlld0JveD0iMCAwIDEyODAgMTQwIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxnIGZpbGw9IiNmZmZmZmYiPjxwYXRoIGQ9Ik04NTMuODkzLDg2Ljk5OGMtMzguODU5LDAtNTguODExLTE2LjQ1NS03Ny45NTYtMzUuMDUxYzE4LjI5NS0xMC41MzYsNDAuODkxLTE4LjI3Niw3My4zNzgtMTguMjc2IGMzOC42ODUsMCw2NC4xMzIsMTIuNTY0LDg1LjQ4OSwyOC4zNDdDOTE2LjE5Miw3Mi4wMTIsOTAwLjgsODYuOTk4LDg1My44OTMsODYuOTk4eiBNNTI2LjI2NSw4MC45NDUgYy02LjUxNy0wLjU2Mi0xMy41OTktMC44NzktMjEuNDEtMC44NzljLTcwLjc5OSwwLTkxLjMzNywyNy4yMjktMTM0LjQzMywzNS42NjJjMTQuOTAxLDMuNzIsMzIuMTE4LDYuMDcsNTIuODk4LDYuMDcgQzQ3MC4xNzEsMTIxLjc5Nyw1MDAuMzQsMTAzLjQyMSw1MjYuMjY1LDgwLjk0NXoiIGZpbGwtb3BhY2l0eT0iLjMiLz48cGF0aCBkPSJNNjYzLjQ1OCwxMDkuNjcxYy02Ny4xMzcsMC04MC4zNDUtMjMuODI0LTEzNy4xOTMtMjguNzI2QzU2Ny4wODYsNDUuNTU1LDU5Ny4zODEsMCw2NjUuNjkxLDAgYzYxLjg1NywwLDg1LjM2OSwyNy43ODIsMTEwLjI0Niw1MS45NDdDNzM2Ljg4OCw3NC40MzQsNzE3LjQ1OSwxMDkuNjcxLDY2My40NTgsMTA5LjY3MXogTTIxNy42OCw5NC4xNjMgYzU1Ljk3MSwwLDYyLjUyNiwyNC4wMjYsMTI2LjMzNywyNC4wMjZjOS44NTgsMCwxOC41MDgtMC45MTYsMjYuNDA0LTIuNDYxYy01Ny4xODYtMTQuMjc4LTgwLjE3Ny00OC44MDgtMTM4LjY1OS00OC44MDggYy03Ny4wNjMsMC05OS45Niw0OC41NjktMTUxLjc1MSw0OC41NjljLTQwLjAwNiwwLTYwLjAwOC0xMi4yMDYtODAuMDExLTI5LjUwNnYxNi44MDZjMjAuMDAzLDEwLjg5MSw0MC4wMDUsMjEuNzgyLDgwLjAxMSwyMS43ODIgQzE2MC4wMTQsMTI0LjU3LDE1OC42MDgsOTQuMTYzLDIxNy42OCw5NC4xNjN6IE0xMjAwLjExMiw0Ni4yOTJjLTU3LjQ5MywwLTU2LjkzNSw0Ni41OTUtMTE1LjAxNSw0Ni41OTUgYy01My42MTIsMC01OS43NTUtMzkuNjE4LTExNS42MDItMzkuNjE4Yy0xNS4yNjcsMC0yNS4zODEsMy43NTEtMzQuNjksOC43NDljMzYuMDk2LDI2LjY3NSw2MC41MDMsNjIuNTUyLDExNy4zNDIsNjIuNTUyIGM2OS4yNDksMCw3NS45NTEtNDMuNTU5LDE0Ny45NjQtNDMuNTU5YzM5LjgwNCwwLDU5Ljk4NiwxMC45NDMsNzkuODg4LDIxLjc3N1Y4NS45ODIgQzEyNjAuMDk3LDY4Ljc3MSwxMjM5LjkxNiw0Ni4yOTIsMTIwMC4xMTIsNDYuMjkyeiIgZmlsbC1vcGFjaXR5PSIuNSIvPjxwYXRoIGQ9Ik0xMDUyLjE0NywxMjQuNTdjLTU2Ljg0LDAtODEuMjQ3LTM1Ljg3Ni0xMTcuMzQyLTYyLjU1MmMtMTguNjEzLDkuOTk0LTM0LjAwNSwyNC45OC04MC45MTIsMjQuOTggYy0zOC44NTksMC01OC44MTEtMTYuNDU1LTc3Ljk1Ni0zNS4wNTFjLTM5LjA1LDIyLjQ4Ny01OC40NzksNTcuNzI0LTExMi40OCw1Ny43MjRjLTY3LjEzNywwLTgwLjM0NS0yMy44MjQtMTM3LjE5My0yOC43MjYgYy0yNS45MjUsMjIuNDc1LTU2LjA5Myw0MC44NTItMTAyLjk0Niw0MC44NTJjLTIwLjc3OSwwLTM3Ljk5Ni0yLjM0OS01Mi44OTgtNi4wN2MtNy44OTUsMS41NDUtMTYuNTQ2LDIuNDYxLTI2LjQwNCwyLjQ2MSBjLTYzLjgxMSwwLTcwLjM2Ni0yNC4wMjYtMTI2LjMzNy0yNC4wMjZjLTU5LjA3MiwwLTU3LjY2NSwzMC40MDctMTM3LjY2OSwzMC40MDdjLTQwLjAwNiwwLTYwLjAwOC0xMC44OTEtODAuMDExLTIxLjc4MlYxNDBoMTI4MCB2LTM3LjIxMmMtMTkuOTAzLTEwLjgzNS00MC4wODQtMjEuNzc3LTc5Ljg4OC0yMS43NzdDMTEyOC4wOTgsODEuMDExLDExMjEuMzk3LDEyNC41NywxMDUyLjE0NywxMjQuNTd6Ii8+PC9nPjwvc3ZnPg==)',
                    height: '115px',
                    marginTop: '-115px',
                  }}></div>
                <div className="App-secondary-landing">
                  <h2>How to</h2>
                  <img
                    src={howtoImg}
                    className="App-howto"
                    alt="howto"
                    style={{marginBottom: 15}}
                  />
                  <br/>
                  <h2>Screenshots</h2>
                  <img
                    src={spendingByCategoryImg}
                    className="App-demo"
                    alt="howto"
                    style={{marginBottom: 15}}
                  />
                  <br/>
                  <img
                    src={spendingByCategoryPieImg}
                    className="App-demo"
                    alt="howto"
                    style={{marginBottom: 15}}
                  />
                  <br/>
                  <img
                    src={incomingOutgoingImg}
                    className="App-demo"
                    alt="howto"
                    style={{marginBottom: 15}}
                  />
                  <br/>
                  <img
                    src={tableImg}
                    className="App-demo"
                    alt="howto"
                    style={{marginBottom: 50}}
                  />
                  <br/>
                  <h2>About</h2>
                  <div className="disclaimer">
                    Jagor was forked from{' '}
                    <a href="https://aguno.xyz/jentor/">
                      Jentor
                    </a>
                    .
                  </div>
                  <div className="disclaimer">
                    <h4>Disclaimer</h4>
                    This is still a work-in-progress, may contains bugs, and only supports the English version of transaction history document. Also there is no
                    guarantee that the parser will always work as expected or the generated data will be in full accuracy. If
                    Bank Jago decided to change the PDF layout or column of the
                    report then Jagor may fail. The use or reliance of any information generated on this app is solely at your own risk. 
										<br/><br/>
                    Our app does not and will not upload the PDF file to the
                    cloud. Your document will be parsed and processed in the
                    app/browser itself, hence zero user data will be out from
                    your device. We can not and will not try to obtain your data.
                    We know and fully understand about privacy. <br/><br/>Unsure? Check our{' '}
                    <a href="https://github.com/herpiko/jagor">
                      source code here
                    </a>
                    .
                  </div>
                  <div className="disclaimer footer">
                    <span style={{fontSize: 11}}>
                    	Made in rush with &lt;3.
                    	<br />
                    	<br />
                      Jago is a trademark or a registered trademark of
                      PT Bank Jago Tbk
                    </span>
                  </div>
                </div>
              </div>
            )}
          </header>
        )}
        {this.state.done && (
          <div className="App-done-header">
            Jagor{' '}
            <button
              style={{position: 'absolute', left: 15}}
              onClick={() => {
                this.componentDidMount();
              }}>
              Reset
            </button>
          </div>
        )}
        {/* Charts! */}
        {this.state.categorySpendingEnabled && (
          <div style={{marginBottom: 50, padding: 15}}>
            <h4>Spending by Category</h4>
            <div style={{width: '300px', margin: '0 auto'}}>
              <Dropdown
                options={this.state.timeRangeKeys}
                placeHolder="All (from beginning)"
                onChange={selected => {
                  this.setState({
                    spendingByCategoryDataCurrentRange: selected.value,
                  });
                }}
                value={this.state.spendingByCategoryDataCurrentRange}
              />
            </div>
            {this.state.spendingByCategoryChartType === 'Pie' && (
              <Pie
                data={
                  this.state.spendingByCategoryData[
                    this.state.spendingByCategoryDataCurrentRange
                  ]
                }
                width={500}
                height={300}
                options={{
                  maintainAspectRatio: false,
                  tooltips: {
                    callbacks: {
                      label: function(tooltipItem, data) {
                        let label = data.labels[tooltipItem.index];
                        let value = window.addCommas(
                          data.datasets[0].data[tooltipItem.index].toString(),
                        );
                        return label + ': Rp. ' + value;
                      },
                    },
                  },
                }}
              />
            )}
            {this.state.spendingByCategoryChartType === 'Bar' && (
              <Bar
                data={
                  this.state.spendingByCategoryData[
                    this.state.spendingByCategoryDataCurrentRange
                  ]
                }
                width={500}
                height={300}
                options={{
                  maintainAspectRatio: false,
                  tooltips: {
                    callbacks: {
                      label: function(tooltipItem, data) {
                        let value = window.addCommas(
                          data.datasets[0].data[tooltipItem.index].toString(),
                        );
                        return 'Rp. ' + value;
                      },
                    },
                  },
                }}
              />
            )}
            <div style={{width: '120px', float: 'right'}}>
              <Dropdown
                options={this.state.chartTypes}
                placeHolder="Pie"
                onChange={selected => {
                  this.setState({spendingByCategoryChartType: selected.value});
                }}
                value={this.state.spendingByCategoryChartType}
              />
            </div>
            <br />
          </div>
        )}
        {this.state.incomingOutgoingEnabled && (
          <div style={{marginBottom: 50, padding: 15}}>
            <h4>Total Incoming vs Total Outgoing</h4>
            <div style={{marginTop:'-15px', marginBottom:15, fontSize:11}}>Based on <a href="https://raw.githubusercontent.com/herpiko/jagor/master/src/categories.js">this classification</a></div>
            {/*
            <div style={{width: '300px', margin: '0 auto'}}>
              <Dropdown
                options={this.state.timeRangeKeys}
                placeHolder="All (from beginning)"
                onChange={selected => {
                  this.setState({
                    incomingOutgoingDataCurrentRange: selected.value,
                  });
                }}
                value={this.state.incomingOutgoingDataCurrentRange}
              />
            </div>
            <Bar
              data={
                this.state.incomingOutgoingData[
                  this.state.incomingOutgoingDataCurrentRange
                ]
              }
              options={{
                tooltips: {
                  callbacks: {
                    label: function(tooltipItem, data) {
                      let value = window.addCommas(
                        data.datasets[0].data[tooltipItem.index].toString(),
                      );
                      return 'Rp. ' + value;
                    },
                  },
                },
                tooltips: {
                  mode: 'index',
                  intersect: false,
                },
                scales: {
                  xAxes: [
                    {
                      stacked: true,
                    },
                  ],
                  yAxes: [
                    {
                      stacked: false,
                    },
                  ],
                },
              }}
            />
            <hr />
						*/}
            <Bar
              data={this.state.incomingOutgoingStackedData}
              options={{
                tooltips: {
                  callbacks: {
                    label: function(tooltipItem, data) {
                      let value = window.addCommas(tooltipItem.value);
                      return 'Rp. ' + value;
                    },
                  },
                },
                scales: {
                  xAxes: [
                    {
                      stacked: true,
                    },
                  ],
                  yAxes: [
                    {
                      stacked: true,
                    },
                  ],
                },
              }}
            />
          </div>
        )}
        <div>
          <BrowserView>
            {this.state.rows &&
              this.state.rows.length > 0 &&
              this.state.tableViewEnabled && (
                <div>
                  <h4>Table</h4>
                  <div>
                    CSV file name: <input
                      placeHolder="transaction_history"
                      value={this.state.csvFileName}
                      onChange={(e) => { 
                        this.setState({csvFileName:e.target.value})
                      }}
                    >
                    </input>
                    &nbsp;&nbsp;
                    <a
                      href={'data:application/octet-stream;base64,' + encode(this.state.csvString)}
                      download={this.state.csvFileName +'.csv'}
                    >Download CSV</a>
                  </div>
                  <br/>
                  <ReactTabulator
                    data={this.state.rows}
                    columns={this.state.columns}
                    tooltips={true}
                    layout={'fitData'}
                  />
                </div>
              )}
          </BrowserView>
          <MobileView>
            {this.state.rows &&
              this.state.rows.length > 0 &&
              this.state.tableViewEnabled && (
                <div style={{margin:15}}>
                  <h4>Table</h4>
                  <div>
                    CSV file name: <input
                      placeHolder="transaction_history"
                      value={this.state.csvFileName}
                      onChange={(e) => { 
                        this.setState({csvFileName:e.target.value})
                      }}
                    >
                    </input>
                    &nbsp;&nbsp;
                    <a
                      href={'data:application/octet-stream;base64,' + encode(this.state.csvString)}
                      download={this.state.csvFileName +'.csv'}
                    >Download CSV</a>
                  </div>
                  <br/>
                  Table view does not work well on mobile browser, please
                  use a desktop browser instead.
                </div>
              )}
          </MobileView>
        </div>
      </div>
    );
  }
}

export default App;
