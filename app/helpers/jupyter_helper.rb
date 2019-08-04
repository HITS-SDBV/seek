module JupyterHelper

  # Given a name of a test - search the SEEK config setting for the relevant test spec (ipynb file name, display cells, etc)
  def get_notebook_spec_for_test(test)
    notebook_spec = Settings.defaults[:python_nb_notebooks].detect {|nb| nb["id"] == test }
    if notebook_spec.nil?
	if test.nil?
	      Rails.logger.error "ERROR: no test given!"
	else

	      Rails.logger.error "ERROR: test " + test + " not implemented."
	end
      return
    end
    return notebook_spec
  end

  # Generate a temporary filename, return a KEY from the filename itself
  # Relies on the filename being foo-bla-KEY.suffix   (number of dashes doesn't matter as long as KEY is the last)
  def gen_temp_filename(n)
    arr = n.split(".")                        #seperate filename to prefix and suffix
    key = arr[0].split("-")[-1]               #get a key into the dictionaries (last word from the file name)

    # https://stackoverflow.com/questions/13787746/creating-a-thread-safe-temporary-file-name
    fname = Dir::Tmpname.make_tmpname([arr[0], "."+arr[1]], nil)
    return key, fname
  end

  # Given a list of file names, generates a temporary filename for each and returns a dictionary of filenames and dictionary of paths
  def create_temp_files(file_list, prefix_path)
    fnames = {}
    paths = {}
    for n in file_list
      key, name = gen_temp_filename(n)
      fnames[key] = name
      paths[key] =  prefix_path + "/" + name
    end
    return fnames, paths
  end

  # write a json object into a json file
  def write_from_json(file_to_write, json_obj)
    session.delete :extraction_exception_message
    begin
      outfile = File.new(file_to_write,"w")
      outfile.write(JSON.generate(json_obj))
      outfile.close()
    rescue Exception => e
      ExceptionNotifier.notify_exception(e, data: {
          message: "Error Jupyter notebooks: Error writing file from a JSON object:  #{file_to_write}",
          current_logged_in_user: current_user
      })
      session[:extraction_exception_message] = e.message
    end
  end

  # given a substitution dictionary, replace the "key"s in the specified notebook cell with "value"s.
  # FIXME this replaces only the first line!
  def replace_placeholder_in_notebook_cell(json_notebook, cell, substitutions)
    json_notebook["cells"][cell]["source"].each_with_index do |line, i|
      Rails.logger.info "Cell BEFORE Replace: " + json_notebook["cells"][cell]["source"][i].to_s
      substitutions.each do |key, value|
        if line[key.to_s] then
		line[key.to_s] 	= value
	end
      end
      Rails.logger.info "Cell after Replace: " + json_notebook["cells"][cell]["source"][i].to_s
    end
    return json_notebook
  end

  # given a substitution dictionary, replace the "key"s in the galaxy notebook cell with "value"s.
  def replace_placeholder_in_notebook_cell_galaxy(json_notebook, cell, jsonfile)

    Rails.logger.info "######################################"
    Rails.logger.info jsonfile
    file = File.read(Settings.defaults[:python_nb_tmp]+"/"+jsonfile)
    data_hash = JSON.parse(file)

    sampledata = data_hash["marked"]
    Rails.logger.info data_hash

    json_notebook["cells"][cell]["source"].each_with_index do |line, i|

     #Rails.logger.info "line:#{line}"
      #Rails.logger.info "i:#{i}"

      unless line["SAMPLENAME"].nil?
        line["SAMPLENAME"] = sampledata["0"]["values"][1]
      end

      unless line["STEP1"].nil?
        line["STEP1"] = sampledata["1"]["values"][1]
      end

      unless line["STEP2"].nil?
        line["STEP2"] = sampledata["1"]["values"][2]
      end

      unless line["URL1"].nil?
        line["URL1"] = sampledata["2"]["values"][1].match(/>(.*)</)[1]
      end

      unless line["URL2"].nil?
        line["URL2"] = sampledata["2"]["values"][2].match(/>(.*)</)[1]
      end

    end


    #Rails.logger.info "Cell after Replace: " + json_notebook["cells"][cell]["source"]

  end

  def run_nbconvert_command(input, params, output=nil)
    # location of the nbconvert command to be run
    nbconvert = Settings.defaults[:nbconvert_path]

    to_run = "#{nbconvert} #{input} #{params}"
    unless output.nil?
      to_run += " --output=#{output}"
    end

    Rails.logger.info "Running nbconvert command: #{to_run}"
    result = `#{to_run}`
    Rails.logger.info result
  end

  # select only the given cell list (integers) from the input notebook file, write into a new output notebook file. (small HTML)
  # without_source=True: will only write out the output of each cell (usually figures).
  # Markdown cells are always written out because it is assumed they are used for documentation and clarification of the figures which follow.
  def select_cell_from_notebook(cell_list, in_book_file_path, out_book_file_path, without_source)
    Rails.logger.info "Selecting cells from notebook: " + cell_list.to_s

    notebook_source = File.read(in_book_file_path)
    json_notebook = JSON.parse(notebook_source)
    o = []

    cell_list.each do |i|
      #Rails.logger.info i
      #Rails.logger.info json_notebook["cells"][i]['source']
      if(without_source>0 and json_notebook["cells"][i]["cell_type"] != "markdown")
        json_notebook["cells"][i]['source']=[]
        json_notebook["cells"][i].delete :source
      end
      o = o.push json_notebook["cells"][i]
    end

    json_notebook["cells"]=o

    # write the modified book
    outfile = File.new(out_book_file_path,"w")
    outfile.write(JSON.generate(json_notebook))
    outfile.close()
  end

  def create_notebook_url(key,file_format)
    return "#{root_url}#{controller_name.downcase}/#{params["id"]}/get_book?bookKey=#{key};bookFormat=#{file_format}"
  end

end
